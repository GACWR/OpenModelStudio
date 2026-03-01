"""OpenModelStudio SDK — register models, load datasets, and track experiments from workspaces."""

from .client import Client
from .model import (
    register_model,
    publish_version,
    log_metric,
    list_datasets,
    load_dataset,
    upload_dataset,
    create_dataset,
    load_model,
    # Feature Store
    create_features,
    load_features,
    # Hyperparameter Store
    create_hyperparameters,
    load_hyperparameters,
    list_hyperparameters,
    # Job Kickoff
    start_training,
    start_inference,
    get_job,
    wait_for_job,
    # Pipelines
    create_pipeline,
    run_pipeline,
    get_pipeline,
    list_pipelines,
    # Monitoring
    list_jobs,
    stream_metrics,
    # Sweeps
    create_sweep,
    get_sweep,
    stop_sweep,
    # Logging
    post_log,
    get_logs,
    # Experiments
    create_experiment,
    list_experiments,
    get_experiment,
    add_experiment_run,
    list_experiment_runs,
    compare_experiment_runs,
    delete_experiment,
)

__version__ = "0.0.1"

__all__ = [
    "Client",
    # Model registration
    "register_model",
    "publish_version",
    "log_metric",
    # Datasets
    "list_datasets",
    "load_dataset",
    "upload_dataset",
    "create_dataset",
    # Model loading
    "load_model",
    # Feature Store
    "create_features",
    "load_features",
    # Hyperparameter Store
    "create_hyperparameters",
    "load_hyperparameters",
    "list_hyperparameters",
    # Job Kickoff
    "start_training",
    "start_inference",
    "get_job",
    "wait_for_job",
    # Pipelines
    "create_pipeline",
    "run_pipeline",
    "get_pipeline",
    "list_pipelines",
    # Monitoring
    "list_jobs",
    "stream_metrics",
    # Sweeps
    "create_sweep",
    "get_sweep",
    "stop_sweep",
    # Logging
    "post_log",
    "get_logs",
    # Experiments
    "create_experiment",
    "list_experiments",
    "get_experiment",
    "add_experiment_run",
    "list_experiment_runs",
    "compare_experiment_runs",
    "delete_experiment",
]
