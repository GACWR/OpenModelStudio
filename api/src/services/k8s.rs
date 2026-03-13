use k8s_openapi::api::batch::v1::Job as K8sJob;
use k8s_openapi::api::batch::v1::JobSpec;
use k8s_openapi::api::core::v1::{
    Container, EnvVar, PodSpec, PodTemplateSpec, Pod, ResourceRequirements,
    PersistentVolumeClaim, PersistentVolumeClaimSpec, Volume, VolumeMount,
    PersistentVolumeClaimVolumeSource,
    Service, ServicePort, ServiceSpec,
};
use k8s_openapi::apimachinery::pkg::api::resource::Quantity;
use k8s_openapi::apimachinery::pkg::util::intstr::IntOrString;
use kube::api::{Api, DeleteParams, PostParams};
use kube::Client;
use std::collections::BTreeMap;
use uuid::Uuid;

use crate::config::Config;

pub struct K8sService {
    client: Client,
    namespace: String,
    config: Config,
}

impl K8sService {
    pub async fn new(config: &Config) -> Result<Self, kube::Error> {
        let client = Client::try_default().await?;
        Ok(Self {
            client,
            namespace: config.k8s_namespace.clone(),
            config: config.clone(),
        })
    }

    /// Create a K8s Job for training or inference
    #[allow(clippy::too_many_arguments)]
    pub async fn create_training_job(
        &self,
        job_id: Uuid,
        model_id: Uuid,
        framework: &str,
        hardware_tier: &str,
        dataset_id: Option<Uuid>,
        hyperparameters: Option<&serde_json::Value>,
        job_type: &str,
    ) -> Result<String, kube::Error> {
        let job_name = format!("oms-job-{}", job_id);
        let image = match framework {
            "pytorch" | "tensorflow" | "python" => "openmodelstudio/model-runner-python:latest",
            "rust" => "openmodelstudio/rust-runner:latest",
            _ => "openmodelstudio/model-runner-python:latest",
        };

        let (cpu_req, mem_req, cpu_limit, mem_limit, gpu) = match hardware_tier {
            "gpu-small" => ("1", "2Gi", "4", "8Gi", Some("1")),
            "gpu-large" => ("2", "4Gi", "8", "16Gi", Some("4")),
            "cpu-small" => ("500m", "512Mi", "2", "2Gi", None),
            "cpu-large" => ("2", "4Gi", "8", "16Gi", None),
            _ => ("500m", "512Mi", "2", "2Gi", None),
        };

        let mut requests = BTreeMap::new();
        requests.insert("cpu".to_string(), Quantity(cpu_req.to_string()));
        requests.insert("memory".to_string(), Quantity(mem_req.to_string()));

        let mut limits = BTreeMap::new();
        limits.insert("cpu".to_string(), Quantity(cpu_limit.to_string()));
        limits.insert("memory".to_string(), Quantity(mem_limit.to_string()));
        if let Some(g) = gpu {
            limits.insert("nvidia.com/gpu".to_string(), Quantity(g.to_string()));
        }

        let mut env_vars = vec![
            EnvVar {
                name: "MODEL_ID".into(),
                value: Some(model_id.to_string()),
                ..Default::default()
            },
            EnvVar {
                name: "JOB_ID".into(),
                value: Some(job_id.to_string()),
                ..Default::default()
            },
            EnvVar {
                name: "JOB_TYPE".into(),
                value: Some(job_type.to_string()),
                ..Default::default()
            },
            EnvVar {
                name: "DB_URL".into(),
                value: Some(self.config.database_url.clone()),
                ..Default::default()
            },
            EnvVar {
                name: "S3_BUCKET".into(),
                value: Some(self.config.s3_bucket.clone()),
                ..Default::default()
            },
            EnvVar {
                name: "METRICS_ENDPOINT".into(),
                value: Some(format!(
                    "http://api.{}.svc:8080/internal/metrics",
                    self.namespace
                )),
                ..Default::default()
            },
            EnvVar {
                name: "LOGS_ENDPOINT".into(),
                value: Some(format!(
                    "http://api.{}.svc:8080/internal/logs",
                    self.namespace
                )),
                ..Default::default()
            },
        ];

        if let Some(ds_id) = dataset_id {
            env_vars.push(EnvVar {
                name: "DATASET_ID".into(),
                value: Some(ds_id.to_string()),
                ..Default::default()
            });
        }

        if let Some(hp) = hyperparameters {
            env_vars.push(EnvVar {
                name: "HYPERPARAMETERS".into(),
                value: Some(hp.to_string()),
                ..Default::default()
            });
        }

        let job = K8sJob {
            metadata: k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta {
                name: Some(job_name.clone()),
                namespace: Some(self.namespace.clone()),
                labels: Some(BTreeMap::from([
                    ("app".to_string(), "openmodelstudio".to_string()),
                    ("job-id".to_string(), job_id.to_string()),
                ])),
                ..Default::default()
            },
            spec: Some(JobSpec {
                backoff_limit: Some(0),
                template: PodTemplateSpec {
                    spec: Some(PodSpec {
                        restart_policy: Some("Never".to_string()),
                        containers: vec![Container {
                            name: "runner".to_string(),
                            image: Some(image.to_string()),
                            image_pull_policy: Some("Never".to_string()),
                            env: Some(env_vars),
                            resources: Some(ResourceRequirements {
                                requests: Some(requests),
                                limits: Some(limits),
                                ..Default::default()
                            }),
                            ..Default::default()
                        }],
                        ..Default::default()
                    }),
                    ..Default::default()
                },
                ..Default::default()
            }),
            ..Default::default()
        };

        let jobs_api: Api<K8sJob> = Api::namespaced(self.client.clone(), &self.namespace);
        let _created = jobs_api.create(&PostParams::default(), &job).await?;

        Ok(job_name)
    }

    /// Find the next available workspace NodePort in the 31100-31109 range
    async fn find_available_workspace_port(&self) -> Result<i32, kube::Error> {
        let svc_api: Api<Service> = Api::namespaced(self.client.clone(), &self.namespace);
        let svcs = svc_api.list(&Default::default()).await?;

        let used_ports: std::collections::HashSet<i32> = svcs
            .items
            .iter()
            .filter_map(|s| {
                s.spec.as_ref()
                    .and_then(|spec| spec.ports.as_ref())
                    .and_then(|ports| ports.first())
                    .and_then(|p| p.node_port)
            })
            .collect();

        for port in 31100..=31109 {
            if !used_ports.contains(&port) {
                return Ok(port);
            }
        }
        // Fallback: let K8s allocate
        Ok(0)
    }

    /// Create a PersistentVolumeClaim for a workspace's working directory
    pub async fn create_workspace_pvc(&self, workspace_id: Uuid) -> Result<String, kube::Error> {
        let pvc_name = format!("oms-ws-{}-data", workspace_id);
        let pvc = PersistentVolumeClaim {
            metadata: k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta {
                name: Some(pvc_name.clone()),
                namespace: Some(self.namespace.clone()),
                labels: Some(BTreeMap::from([
                    ("app".to_string(), "openmodelstudio".to_string()),
                    ("workspace-id".to_string(), workspace_id.to_string()),
                ])),
                ..Default::default()
            },
            spec: Some(PersistentVolumeClaimSpec {
                access_modes: Some(vec!["ReadWriteOnce".to_string()]),
                resources: Some(k8s_openapi::api::core::v1::VolumeResourceRequirements {
                    requests: Some(BTreeMap::from([
                        ("storage".to_string(), Quantity("5Gi".to_string())),
                    ])),
                    ..Default::default()
                }),
                ..Default::default()
            }),
            ..Default::default()
        };
        let pvcs: Api<PersistentVolumeClaim> = Api::namespaced(self.client.clone(), &self.namespace);
        pvcs.create(&PostParams::default(), &pvc).await?;
        Ok(pvc_name)
    }

    /// Delete a workspace PVC (only on permanent workspace deletion)
    pub async fn delete_workspace_pvc(&self, workspace_id: Uuid) -> Result<(), kube::Error> {
        let pvc_name = format!("oms-ws-{}-data", workspace_id);
        let pvcs: Api<PersistentVolumeClaim> = Api::namespaced(self.client.clone(), &self.namespace);
        let _ = pvcs.delete(&pvc_name, &DeleteParams::default()).await;
        Ok(())
    }

    /// Create a workspace pod (JupyterLab) with a NodePort Service
    pub async fn create_workspace_pod(
        &self,
        workspace_id: Uuid,
        docker_image: &str,
        hardware_tier: &str,
        project_id: Uuid,
        workspace_token: &str,
        pvc_name: &str,
    ) -> Result<(String, String), kube::Error> {
        let pod_name = format!("oms-ws-{}", workspace_id);
        let svc_name = format!("oms-ws-{}-svc", workspace_id);

        let (cpu_req, mem_req, cpu_limit, mem_limit, gpu) = match hardware_tier {
            "gpu-small" => ("500m", "1Gi", "2", "4Gi", Some("1")),
            "gpu-large" => ("1", "2Gi", "4", "8Gi", Some("4")),
            "cpu-large" => ("500m", "2Gi", "2", "4Gi", None),
            _ => ("250m", "512Mi", "500m", "1Gi", None),
        };

        let mut ws_requests = BTreeMap::new();
        ws_requests.insert("cpu".to_string(), Quantity(cpu_req.to_string()));
        ws_requests.insert("memory".to_string(), Quantity(mem_req.to_string()));

        let mut limits = BTreeMap::new();
        limits.insert("cpu".to_string(), Quantity(cpu_limit.to_string()));
        limits.insert("memory".to_string(), Quantity(mem_limit.to_string()));
        if let Some(g) = gpu {
            limits.insert("nvidia.com/gpu".to_string(), Quantity(g.to_string()));
        }

        let ws_labels = BTreeMap::from([
            ("app".to_string(), "openmodelstudio-workspace".to_string()),
            ("workspace-id".to_string(), workspace_id.to_string()),
        ]);

        // Create the workspace pod with token auth disabled
        let pod = Pod {
            metadata: k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta {
                name: Some(pod_name.clone()),
                namespace: Some(self.namespace.clone()),
                labels: Some(ws_labels.clone()),
                ..Default::default()
            },
            spec: Some(PodSpec {
                containers: vec![Container {
                    name: "jupyter".to_string(),
                    image: Some(docker_image.to_string()),
                    image_pull_policy: Some("Never".to_string()),
                    command: Some(vec![
                        "start-notebook.sh".to_string(),
                        "--ServerApp.token=".to_string(),
                        "--ServerApp.password=".to_string(),
                        "--ServerApp.allow_origin=*".to_string(),
                        "--ServerApp.allow_remote_access=True".to_string(),
                        "--ServerApp.disable_check_xsrf=True".to_string(),
                        "--ServerApp.base_url=/".to_string(),
                        "--ServerApp.tornado_settings={\"headers\":{\"Content-Security-Policy\":\"frame-ancestors * 'self'\"}}".to_string(),
                    ]),
                    env: Some(vec![
                        EnvVar {
                            name: "JUPYTER_ENABLE_LAB".into(),
                            value: Some("yes".into()),
                            ..Default::default()
                        },
                        EnvVar {
                            name: "OPENMODELSTUDIO_API_URL".into(),
                            value: Some(format!("http://api.{}.svc:8080", self.namespace)),
                            ..Default::default()
                        },
                        EnvVar {
                            name: "OPENMODELSTUDIO_TOKEN".into(),
                            value: Some(workspace_token.to_string()),
                            ..Default::default()
                        },
                        EnvVar {
                            name: "OPENMODELSTUDIO_WORKSPACE_ID".into(),
                            value: Some(workspace_id.to_string()),
                            ..Default::default()
                        },
                        EnvVar {
                            name: "OPENMODELSTUDIO_PROJECT_ID".into(),
                            value: Some(project_id.to_string()),
                            ..Default::default()
                        },
                    ]),
                    resources: Some(ResourceRequirements {
                        requests: Some(ws_requests),
                        limits: Some(limits),
                        ..Default::default()
                    }),
                    ports: Some(vec![k8s_openapi::api::core::v1::ContainerPort {
                        container_port: 8888,
                        ..Default::default()
                    }]),
                    volume_mounts: Some(vec![VolumeMount {
                        name: "workspace-data".to_string(),
                        mount_path: "/home/jovyan/work".to_string(),
                        ..Default::default()
                    }]),
                    ..Default::default()
                }],
                volumes: Some(vec![Volume {
                    name: "workspace-data".to_string(),
                    persistent_volume_claim: Some(PersistentVolumeClaimVolumeSource {
                        claim_name: pvc_name.to_string(),
                        read_only: Some(false),
                    }),
                    ..Default::default()
                }]),
                ..Default::default()
            }),
            ..Default::default()
        };

        let pods_api: Api<Pod> = Api::namespaced(self.client.clone(), &self.namespace);
        let _created = pods_api.create(&PostParams::default(), &pod).await?;

        // Find next available port in the workspace range (31100-31109)
        let node_port = self.find_available_workspace_port().await?;

        // Create a NodePort Service so the browser can reach the workspace
        let mut svc_port = ServicePort {
            port: 8888,
            target_port: Some(IntOrString::Int(8888)),
            ..Default::default()
        };
        if node_port > 0 {
            svc_port.node_port = Some(node_port);
        }

        let svc = Service {
            metadata: k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta {
                name: Some(svc_name.clone()),
                namespace: Some(self.namespace.clone()),
                labels: Some(ws_labels.clone()),
                ..Default::default()
            },
            spec: Some(ServiceSpec {
                type_: Some("NodePort".to_string()),
                selector: Some(BTreeMap::from([
                    ("workspace-id".to_string(), workspace_id.to_string()),
                ])),
                ports: Some(vec![svc_port]),
                ..Default::default()
            }),
            ..Default::default()
        };

        let svc_api: Api<Service> = Api::namespaced(self.client.clone(), &self.namespace);
        let created_svc = svc_api.create(&PostParams::default(), &svc).await?;

        // Read back the final allocated NodePort
        let final_port = created_svc
            .spec
            .as_ref()
            .and_then(|s| s.ports.as_ref())
            .and_then(|ports| ports.first())
            .and_then(|p| p.node_port)
            .unwrap_or(node_port);

        let access_url = format!("http://localhost:{}", final_port);

        Ok((pod_name, access_url))
    }

    /// Delete a K8s job
    pub async fn delete_job(&self, job_name: &str) -> Result<(), kube::Error> {
        let jobs_api: Api<K8sJob> = Api::namespaced(self.client.clone(), &self.namespace);
        let _ = jobs_api.delete(job_name, &DeleteParams::default()).await?;
        Ok(())
    }

    /// Delete a workspace pod and its associated NodePort service
    pub async fn delete_pod(&self, pod_name: &str) -> Result<(), kube::Error> {
        let pods_api: Api<Pod> = Api::namespaced(self.client.clone(), &self.namespace);
        let _ = pods_api.delete(pod_name, &DeleteParams::default()).await?;

        // Also delete the associated service
        let svc_name = format!("{}-svc", pod_name);
        let svc_api: Api<Service> = Api::namespaced(self.client.clone(), &self.namespace);
        let _ = svc_api.delete(&svc_name, &DeleteParams::default()).await;

        Ok(())
    }
}
