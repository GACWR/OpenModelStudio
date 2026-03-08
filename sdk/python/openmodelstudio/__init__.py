"""OpenModelStudio SDK — register models, load datasets, track experiments, and visualize from workspaces."""

from .client import Client, RegistryModel
from .model import (
    register_model,
    publish_version,
    log_metric,
    list_datasets,
    load_dataset,
    upload_dataset,
    create_dataset,
    load_model,
    # Registry Model
    use_model,
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

# Registry
from .registry import (
    registry_search,
    registry_list,
    registry_info,
    registry_install,
    registry_uninstall,
    list_installed,
    set_registry,
)

# Visualization
from .visualization import (
    create_visualization,
    publish_visualization,
    render_visualization,
    list_visualizations,
    delete_visualization,
    create_dashboard,
    update_dashboard,
    list_dashboards,
    get_dashboard,
    delete_dashboard,
    render,
    detect_backend,
    VisualizationContext,
    SUPPORTED_BACKENDS,
)

# Config
from .config import (
    get_registry_url,
    set_registry_url,
    get_models_dir,
    set_models_dir,
    get_config,
)

__version__ = "0.0.2"

__all__ = [
    "Client",
    "RegistryModel",
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
    # Registry Model
    "use_model",
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
    # Registry
    "registry_search",
    "registry_list",
    "registry_info",
    "registry_install",
    "registry_uninstall",
    "list_installed",
    "set_registry",
    # Visualization
    "create_visualization",
    "publish_visualization",
    "render_visualization",
    "list_visualizations",
    "delete_visualization",
    "create_dashboard",
    "update_dashboard",
    "list_dashboards",
    "get_dashboard",
    "delete_dashboard",
    "render",
    "detect_backend",
    "VisualizationContext",
    "SUPPORTED_BACKENDS",
    # Config
    "get_registry_url",
    "set_registry_url",
    "get_models_dir",
    "set_models_dir",
    "get_config",
]
