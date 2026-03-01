# Modeling Guide

End-to-end ML workflow using the OpenModelStudio SDK inside JupyterLab. This guide assumes you have a workspace running with a dataset uploaded (see [Usage Guide](USAGE.md) for setup). We use the [Titanic dataset](https://github.com/datasciencedojo/datasets/blob/master/titanic.csv) throughout.

The SDK (`import openmodelstudio`) is pre-configured in every workspace -- no setup needed.

## Cell 1 -- Imports

```python
import openmodelstudio
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
```

## Cell 2 -- Load and Prep Data

```python
df = openmodelstudio.load_dataset("titanic")
df = df.dropna(subset=["Survived", "Pclass", "Age", "Fare"])
print(f"Loaded {len(df)} rows")
df.head()
```

## Cell 3 -- Register Features in the Feature Store

```python
openmodelstudio.create_features(df,
    feature_names=["Pclass", "Age", "Fare"],
    group_name="titanic-v1",
    transforms={"Age": "standard_scaler", "Fare": "min_max_scaler"})

df_scaled = openmodelstudio.load_features("titanic-v1", df=df)
print("Features registered and transforms applied")
df_scaled[["Pclass", "Age", "Fare"]].describe()
```

After this cell, check the **Feature Store** page in the sidebar -- your `titanic-v1` feature group is now visible with stats and transforms.

## Cell 4 -- Store Hyperparameters

```python
openmodelstudio.create_hyperparameters("rf-tuned", {
    "n_estimators": 200,
    "max_depth": 8,
    "min_samples_split": 4,
    "random_state": 42,
})
print("Hyperparameters stored")
```

## Cell 5 -- Register Model

```python
params = openmodelstudio.load_hyperparameters("rf-tuned")
clf = RandomForestClassifier(**params)

handle = openmodelstudio.register_model("titanic-rf", model=clf)
print(handle)
# ModelHandle(id='...', name='titanic-rf', version=1)
```

After this cell, check the **Models** page -- your `titanic-rf` model is now registered with version 1.

## Cell 6 -- Train Through the System

```python
job = openmodelstudio.start_training(handle.model_id,
    hyperparameter_set="rf-tuned",
    wait=True)

print(f"Training status: {job['status']}")
```

This launches an ephemeral Kubernetes pod that trains your model. Check the **Jobs** page to watch loss/accuracy charts update in real-time via SSE.

## Cell 7 -- View Training Logs

```python
logs = openmodelstudio.get_logs(job["id"])
for entry in logs[-10:]:
    print(f"[{entry['level']}] {entry['message']}")
```

## Cell 8 -- Run Inference

```python
result = openmodelstudio.start_inference(handle.model_id,
    input_data={"features": [[3, 25.0, 7.25], [1, 38.0, 71.28]]},
    wait=True)

print(f"Status: {result['status']}")
print(f"Predictions: {result.get('metrics')}")
```

## Cell 9 -- Create an Experiment and Record the Run

```python
exp = openmodelstudio.create_experiment("titanic-tuning",
    description="Comparing RF hyperparameter configs")

openmodelstudio.add_experiment_run(exp["id"],
    job_id=job["id"],
    parameters={"n_estimators": 200, "max_depth": 8, "min_samples_split": 4},
    metrics={"accuracy": 0.94})

print(f"Experiment: {exp['id']}")
```

## Cell 10 -- Run a Second Config and Add to Experiment

```python
openmodelstudio.create_hyperparameters("rf-deep", {
    "n_estimators": 500,
    "max_depth": 15,
    "min_samples_split": 2,
    "random_state": 42,
})

clf2 = RandomForestClassifier(**openmodelstudio.load_hyperparameters("rf-deep"))
handle2 = openmodelstudio.register_model("titanic-rf", model=clf2)

job2 = openmodelstudio.start_training(handle2.model_id,
    hyperparameter_set="rf-deep",
    wait=True)

openmodelstudio.add_experiment_run(exp["id"],
    job_id=job2["id"],
    parameters={"n_estimators": 500, "max_depth": 15, "min_samples_split": 2},
    metrics={"accuracy": 0.96})

print(f"Second run recorded — status: {job2['status']}")
```

## Cell 11 -- Compare Experiment Runs

```python
runs = openmodelstudio.list_experiment_runs(exp["id"])

print(f"\n{'Run':<6} {'n_estimators':<14} {'max_depth':<11} {'accuracy':<10} {'status'}")
print("-" * 55)
for i, r in enumerate(runs):
    p = r.get("parameters", {})
    m = r.get("metrics", {})
    print(f"#{i+1:<5} {str(p.get('n_estimators','')):<14} {str(p.get('max_depth','')):<11} {str(m.get('accuracy','')):<10} {r.get('status', '')}")
```

After this cell, check the **Experiments** page -- your `titanic-tuning` experiment shows both runs side-by-side with parallel coordinates visualization.

## Cell 12 -- Monitor All Jobs

```python
jobs = openmodelstudio.list_jobs()
print(f"\n{'Job ID':<10} {'Type':<12} {'Status':<12} {'Model'}")
print("-" * 55)
for j in jobs[:10]:
    print(f"{j['id'][:8]:<10} {j['job_type']:<12} {j['status']:<12} {j.get('model_id', '')[:8]}")
```

## Cell 13 -- Load Trained Model Back into Notebook

```python
clf_loaded = openmodelstudio.load_model("titanic-rf")
print(f"Model type: {type(clf_loaded).__name__}")
print(f"Estimators: {clf_loaded.n_estimators}")
```

## What You Built

After running the notebook, everything is visible across the platform:

| Page | What You'll See |
|------|----------------|
| **Models** | `titanic-rf` with version history (v1, v2) |
| **Feature Store** | `titanic-v1` feature group with `Pclass`, `Age`, `Fare` and their transforms/stats |
| **Jobs** | Training and inference jobs with status, duration, metrics charts |
| **Experiments** | `titanic-tuning` experiment with two runs, parallel coordinates, metric comparison |
| **Datasets** | `titanic` dataset with format, size, and version info |
| **Dashboard** | Updated summary metrics reflecting your new models, jobs, and experiments |
