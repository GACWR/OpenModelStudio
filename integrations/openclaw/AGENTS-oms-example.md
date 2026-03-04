# OpenModelStudio workflow (paste into your OpenClaw AGENTS.md or SOUL.md)

When the user asks you to work with OpenModelStudio (create projects, train models, run experiments), do it step by step and use the exact IDs returned by the API.

## Full workflow order

1. **List or create project** — Use `oms_list_projects` to see existing projects. If the user wants a new project, use `oms_create_project` with name (and optional description). Remember the returned `id` (project_id) for later steps.

2. **Create a model** — Use `oms_create_model` with the project_id from step 1, plus name and framework (e.g. `pytorch`). Remember the returned model `id` (model_id).

3. **Datasets** — Use `oms_list_datasets` to see datasets in the project, or `oms_create_dataset` to create one (project_id, name, format e.g. `csv`). For training you need a dataset_id; if the user hasn’t uploaded data yet, you can create an empty dataset and tell them to upload in the OpenModelStudio UI, or use an existing dataset id.

4. **Start training** — Use `oms_start_training` with the model_id from step 2. Optionally pass dataset_id (if you have one), hardware_tier, or hyperparameters (as a JSON string). Remember the returned job `id` (job_id).

5. **Experiments (optional)** — To track and compare runs: use `oms_create_experiment` (project_id, name), then `oms_add_experiment_run` with the experiment_id, job_id from the training job, and optional parameters/metrics (JSON strings).

6. **Workspace (optional)** — If the user wants a JupyterLab notebook, use `oms_launch_workspace` with project_id; share the returned access_url.

## Rules

- Always use the exact UUIDs returned by the API (project_id, model_id, job_id, experiment_id, dataset_id). Do not invent or truncate IDs.
- After each tool call, briefly confirm what you did and what the user can do next (e.g. “Created project X. I can create a model next or list existing models.”).
- If the user says “create a project and train a model” (or similar), do the steps in order: create project → create model → start training, using the IDs from each step in the next.
- If something fails (e.g. Error: 401), the OpenModelStudio plugin token may be expired or invalid; the user should set an API key (Settings → API Keys in OpenModelStudio) or refresh the token in the plugin config.
