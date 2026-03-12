"""Module-level convenience functions that use a default Client instance."""

from .client import Client, ModelHandle, RegistryModel

_client = None


def _get_client() -> Client:
    global _client
    if _client is None:
        _client = Client()  # auto-configures from env vars
    return _client


def register_model(
    name: str,
    model=None,
    framework: str = None,
    description: str = None,
    source_code: str = None,
    file: str = None,
) -> ModelHandle:
    """Register a new model in the current project.

    Pass a trained model object — framework is auto-detected::

        handle = openmodelstudio.register_model("my-clf", model=clf)

    Or point to a .py file with train(ctx)/infer(ctx)::

        handle = openmodelstudio.register_model("my-model", file="train.py")
    """
    return _get_client().register_model(
        name, model=model, framework=framework,
        description=description, source_code=source_code, file=file,
    )


def publish_version(
    model_id: str,
    source_code: str = None,
    artifact_path: str = None,
    summary: str = None,
) -> dict:
    """Publish a new version of an existing model.

    Example::

        import openmodelstudio
        openmodelstudio.publish_version(model.model_id, source_code=open("train.py").read())
    """
    return _get_client().publish_version(model_id, source_code, artifact_path, summary)


def log_metric(
    job_id: str,
    metric_name: str,
    value: float,
    step: int = None,
    epoch: int = None,
):
    """Log a metric for a running training job."""
    return _get_client().log_metric(job_id, metric_name, value, step, epoch)


def list_datasets() -> list:
    """List all datasets in the current project.

    Example::

        datasets = openmodelstudio.list_datasets()
        for ds in datasets:
            print(ds["name"], ds["format"])
    """
    return _get_client().list_datasets()


def load_dataset(name_or_id: str, format: str = None):
    """Load a dataset by name or UUID into a pandas DataFrame.

    Example::

        df = openmodelstudio.load_dataset("titanic")
        df.head()
    """
    return _get_client().load_dataset(name_or_id, format=format)


def upload_dataset(dataset_id: str, file_path: str) -> dict:
    """Upload a local file to an existing dataset.

    Example::

        openmodelstudio.upload_dataset("54e1ee81-...", "titanic.csv")
    """
    return _get_client().upload_dataset(dataset_id, file_path)


def create_dataset(name: str, data, format: str = None, description: str = None) -> dict:
    """Create a new dataset from a DataFrame or file.

    Examples::

        ds = openmodelstudio.create_dataset("my-data", df)
        ds = openmodelstudio.create_dataset("my-data", "data.csv")
    """
    return _get_client().create_dataset(name, data, format=format, description=description)


def load_model(name_or_id: str, version: int = None, device: str = None):
    """Load a trained model by name or UUID.

    Returns the deserialized model object for inference in a notebook.

    Examples::

        clf = openmodelstudio.load_model("my-classifier")
        predictions = clf.predict(X_test)
    """
    return _get_client().load_model(name_or_id, version=version, device=device)


def use_model(registry_name: str) -> RegistryModel:
    """Load an installed registry model, ready to register.

    Works inside workspace containers (resolves via API) and on the host
    (falls back to local filesystem). Auto-installs from registry if
    not yet installed.

    Examples::

        iris = openmodelstudio.use_model("iris-svm")
        handle = openmodelstudio.register_model("my-iris", model=iris)
    """
    return _get_client().use_model(registry_name)


# ── Feature Store ────────────────────────────────────────────────────

def create_features(df, feature_names=None, group_name=None, entity="default", transforms=None) -> dict:
    """Register features from a DataFrame into the feature store.

    Examples::

        openmodelstudio.create_features(df, group_name="titanic-features")
        openmodelstudio.create_features(df, transforms={"Age": "standard_scaler"})
    """
    return _get_client().create_features(
        df, feature_names=feature_names, group_name=group_name,
        entity=entity, transforms=transforms,
    )


def load_features(group_name_or_id: str, df=None):
    """Load features from the store. If df provided, apply transforms.

    Examples::

        features = openmodelstudio.load_features("titanic-features")
        df_transformed = openmodelstudio.load_features("titanic-features", df=df)
    """
    return _get_client().load_features(group_name_or_id, df=df)


# ── Hyperparameter Store ─────────────────────────────────────────────

def create_hyperparameters(name: str, parameters: dict, model_id=None, description=None) -> dict:
    """Create a named hyperparameter set.

    Example::

        openmodelstudio.create_hyperparameters("lr-v1", {"lr": 0.001, "epochs": 10})
    """
    return _get_client().create_hyperparameters(
        name, parameters, model_id=model_id, description=description,
    )


def load_hyperparameters(name_or_id: str) -> dict:
    """Load a hyperparameter set by name or UUID. Returns the parameters dict.

    Example::

        params = openmodelstudio.load_hyperparameters("lr-v1")
    """
    return _get_client().load_hyperparameters(name_or_id)


def list_hyperparameters() -> list:
    """List all hyperparameter sets in the current project."""
    return _get_client().list_hyperparameters()


# ── Job Kickoff ──────────────────────────────────────────────────────

def start_training(
    model_id: str, dataset_id=None, hyperparameters=None,
    hyperparameter_set=None, hardware_tier="cpu-small",
    experiment_id=None, wait=False,
) -> dict:
    """Start a training job.

    Example::

        job = openmodelstudio.start_training("my-model", dataset_id="titanic",
            hyperparameters={"lr": 0.001}, wait=True)
    """
    return _get_client().start_training(
        model_id, dataset_id=dataset_id, hyperparameters=hyperparameters,
        hyperparameter_set=hyperparameter_set, hardware_tier=hardware_tier,
        experiment_id=experiment_id, wait=wait,
    )


def start_inference(
    model_id: str, input_data=None, dataset_id=None,
    hardware_tier="cpu-small", wait=False,
) -> dict:
    """Start an inference job.

    Example::

        result = openmodelstudio.start_inference("my-model",
            input_data={"features": [1, 2, 3]}, wait=True)
    """
    return _get_client().start_inference(
        model_id, input_data=input_data, dataset_id=dataset_id,
        hardware_tier=hardware_tier, wait=wait,
    )


def get_job(job_id: str) -> dict:
    """Get job details by UUID."""
    return _get_client().get_job(job_id)


def wait_for_job(job_id: str, poll_interval: float = 2.0) -> dict:
    """Poll a job until it reaches a terminal state."""
    return _get_client().wait_for_job(job_id, poll_interval=poll_interval)


# ── Pipelines ────────────────────────────────────────────────────────

def create_pipeline(name: str, steps: list, description=None) -> dict:
    """Create a multi-step pipeline.

    Example::

        openmodelstudio.create_pipeline("train-and-infer", [
            {"type": "training", "model_id": "my-model", "dataset_id": "titanic"},
            {"type": "inference", "model_id": "my-model"},
        ])
    """
    return _get_client().create_pipeline(name, steps, description=description)


def run_pipeline(pipeline_id: str, wait=False) -> dict:
    """Execute a pipeline."""
    return _get_client().run_pipeline(pipeline_id, wait=wait)


def get_pipeline(pipeline_id: str) -> dict:
    """Get pipeline status and step details."""
    return _get_client().get_pipeline(pipeline_id)


def list_pipelines() -> list:
    """List all pipelines in the current project."""
    return _get_client().list_pipelines()


# ── Monitoring ───────────────────────────────────────────────────────

def list_jobs(job_type=None, status=None) -> list:
    """List all jobs (training and inference) in the current project."""
    return _get_client().list_jobs(job_type=job_type, status=status)


def stream_metrics(job_id: str, callback=None):
    """Stream real-time metrics from a running job via SSE.

    Example::

        for event in openmodelstudio.stream_metrics(job_id):
            print(event)
    """
    return _get_client().stream_metrics(job_id, callback=callback)


# ── Sweeps ───────────────────────────────────────────────────────────

def create_sweep(
    name: str, model_id: str, dataset_id: str, search_space: dict,
    strategy="random", max_trials=10, objective_metric="loss",
    objective_direction="minimize", hardware_tier="cpu-small", wait=False,
) -> dict:
    """Create and start a hyperparameter sweep.

    Example::

        openmodelstudio.create_sweep("lr-search", model_id="my-model",
            dataset_id="titanic", search_space={
                "lr": {"type": "log_uniform", "min": 1e-5, "max": 1e-1},
            }, max_trials=20)
    """
    return _get_client().create_sweep(
        name, model_id, dataset_id, search_space,
        strategy=strategy, max_trials=max_trials,
        objective_metric=objective_metric, objective_direction=objective_direction,
        hardware_tier=hardware_tier, wait=wait,
    )


def get_sweep(sweep_id: str) -> dict:
    """Get sweep status and results."""
    return _get_client().get_sweep(sweep_id)


def stop_sweep(sweep_id: str) -> dict:
    """Stop a running sweep."""
    return _get_client().stop_sweep(sweep_id)


# ── Logging ───────────────────────────────────────────────────────────

def post_log(job_id: str, message: str, level: str = "info", logger_name: str = None) -> dict:
    """Post a log entry for a running job."""
    return _get_client().post_log(job_id, message, level=level, logger_name=logger_name)


def get_logs(job_id: str, level: str = None, limit: int = None, offset: int = None) -> list:
    """Get logs for a job."""
    return _get_client().get_logs(job_id, level=level, limit=limit, offset=offset)


# ── Experiments ───────────────────────────────────────────────────────

def create_experiment(name: str, project_id: str = None, description: str = None) -> dict:
    """Create a new experiment.

    Example::

        exp = openmodelstudio.create_experiment("lr-sweep-v1")
    """
    return _get_client().create_experiment(name, project_id=project_id, description=description)


def list_experiments(project_id: str = None) -> list:
    """List experiments, optionally filtered by project."""
    return _get_client().list_experiments(project_id=project_id)


def get_experiment(experiment_id: str) -> dict:
    """Get experiment details by UUID."""
    return _get_client().get_experiment(experiment_id)


def add_experiment_run(
    experiment_id: str, job_id: str = None, model_id: str = None,
    parameters: dict = None, metrics: dict = None,
) -> dict:
    """Add a run to an experiment.

    Example::

        openmodelstudio.add_experiment_run(exp["id"], job_id=job["id"],
            parameters={"lr": 0.001}, metrics={"accuracy": 0.95})

        # For in-process training (no K8s job), use model_id:
        openmodelstudio.add_experiment_run(exp["id"], model_id=mid,
            parameters={"lr": 0.001}, metrics={"accuracy": 0.95})
    """
    return _get_client().add_experiment_run(
        experiment_id, job_id=job_id, model_id=model_id,
        parameters=parameters, metrics=metrics,
    )


def list_experiment_runs(experiment_id: str) -> list:
    """List all runs in an experiment."""
    return _get_client().list_experiment_runs(experiment_id)


def compare_experiment_runs(experiment_id: str) -> dict:
    """Compare all runs in an experiment side-by-side."""
    return _get_client().compare_experiment_runs(experiment_id)


def delete_experiment(experiment_id: str) -> dict:
    """Delete an experiment and all its runs."""
    return _get_client().delete_experiment(experiment_id)
