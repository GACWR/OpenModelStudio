# CLI & Model Registry

Install, search, and manage models from the command line using the `openmodelstudio` CLI. Models are published in the [Open Model Registry](https://github.com/GACWR/open-model-registry), a public GitHub repository that acts as a decentralized model package manager.

## Installation

```bash
pip install openmodelstudio
```

This installs both the Python SDK and the `openmodelstudio` CLI command.

## Commands

### Search for Models

```bash
openmodelstudio search classification
```

Output:

```
NAME              VERSION  FRAMEWORK  CATEGORY        DESCRIPTION
---------------   -------  ---------  --------------  -------------------------------------------
iris-svm          1.0.0    sklearn    classification  Support Vector Machine classifier for the...
titanic-rf        1.0.0    sklearn    classification  Random Forest classifier for Titanic surv...
```

Filter by framework or category:

```bash
openmodelstudio search cnn --framework pytorch
openmodelstudio search "" --category nlp
openmodelstudio search "" --framework sklearn --category classification
```

### Browse All Registry Models

```bash
openmodelstudio registry
```

Output:

```
NAME              VERSION  FRAMEWORK  CATEGORY        AUTHOR            DESCRIPTION
---------------   -------  ---------  --------------  ----------------  ---------------------------
iris-svm          1.0.0    sklearn    classification  openmodelstudio   Support Vector Machine cla...
mnist-cnn         1.0.0    pytorch    computer-vision openmodelstudio   Convolutional Neural Netwo...
sentiment-lstm    1.0.0    pytorch    nlp             openmodelstudio   Bidirectional LSTM for tex...
timeseries-arima  1.0.0    python     time-series     openmodelstudio   ARIMA model for univariate...
titanic-rf        1.0.0    sklearn    classification  openmodelstudio   Random Forest classifier f...
```

### Get Model Details

```bash
openmodelstudio info mnist-cnn
```

Output:

```
Name:        mnist-cnn
Version:     1.0.0
Author:      openmodelstudio
Framework:   pytorch
Category:    computer-vision
License:     MIT
Description: Convolutional Neural Network for MNIST digit classification.
Tags:        image-classification, cnn, mnist, beginner, deep-learning
Dependencies: torch>=2.0, torchvision>=0.15, numpy>=1.24
Homepage:    https://github.com/GACWR/open-model-registry
```

### Install a Model

```bash
openmodelstudio install titanic-rf
```

Output:

```
Installing 'titanic-rf' from registry...
Installed to /home/user/.openmodelstudio/models/titanic-rf
```

This downloads the model files and a `model.json` manifest to your local models directory. The model is then available for import and registration with the platform.

Force-reinstall an existing model:

```bash
openmodelstudio install titanic-rf --force
```

### List Installed Models

```bash
openmodelstudio list
```

Output:

```
NAME        VERSION  FRAMEWORK  PATH
----------  -------  ---------  -------------------------------------------
titanic-rf  1.0.0    sklearn    /home/user/.openmodelstudio/models/titanic-rf
mnist-cnn   1.0.0    pytorch    /home/user/.openmodelstudio/models/mnist-cnn
```

### Uninstall a Model

```bash
openmodelstudio uninstall titanic-rf
```

### Using an Installed Model

After installing, use `oms.use_model()` to load the model and register it in your project:

```python
import openmodelstudio as oms

# Load the installed registry model
iris = oms.use_model("iris-svm")

# Register it in your project under any name
handle = oms.register_model("my-iris", model=iris)
print(handle)

# Train it
job = oms.start_training(handle.model_id, wait=True)
print(f"Training: {job['status']}")
```

`use_model()` resolves models via the platform API, so it works inside workspace containers (K8s pods) without requiring filesystem access. If the model isn't installed yet, it auto-installs from the registry.

You can also install directly from the UI on the **Model Registry** page (sidebar > Develop > Model Registry). Each model card shows an **Installed** or **Not Installed** badge.

## Configuration

### View Current Config

```bash
openmodelstudio config
```

Output:

```
registry_url: https://raw.githubusercontent.com/GACWR/open-model-registry/main/registry/index.json
models_dir: /home/user/.openmodelstudio/models
```

### Change Registry URL

Point to a custom registry (your own fork, a private registry, etc.):

```bash
openmodelstudio config set registry_url https://raw.githubusercontent.com/myorg/my-registry/main/registry/index.json
```

Or set via environment variable:

```bash
export OPENMODELSTUDIO_REGISTRY_URL="https://raw.githubusercontent.com/myorg/my-registry/main/registry/index.json"
```

### Change Models Directory

```bash
openmodelstudio config set models_dir /opt/models
```

Or set via environment variable:

```bash
export OPENMODELSTUDIO_MODELS_DIR="/opt/models"
```

## Python SDK (Programmatic Access)

All CLI commands are available as Python functions:

```python
import openmodelstudio as oms

# Search
results = oms.registry_search("classification")
results = oms.registry_search("cnn", framework="pytorch")
results = oms.registry_search("", category="nlp")

# List all
models = oms.registry_list()

# Get info
info = oms.registry_info("titanic-rf")
print(info["description"])
print(info["dependencies"])

# Install
path = oms.registry_install("titanic-rf")
path = oms.registry_install("mnist-cnn", force=True)

# Use an installed model (works in workspace containers)
iris = oms.use_model("iris-svm")
handle = oms.register_model("my-iris", model=iris)

# Uninstall (removes locally + unregisters from platform)
oms.registry_uninstall("titanic-rf")

# List installed
installed = oms.list_installed()

# Switch registry
oms.set_registry("https://raw.githubusercontent.com/myorg/my-registry/main/registry/index.json")
```

## How the Registry Works

The Open Model Registry is a GitHub repository with this structure:

```
open-model-registry/
  models/
    iris-svm/
      model.py           # Model code (train + infer functions)
    mnist-cnn/
      model.py
    sentiment-lstm/
      model.py
    ...
  registry/
    index.json           # Aggregated metadata for all models
  scripts/
    build_index.py       # Generates index.json from model directories
```

Each model directory contains:
- `model.py` -- the model code following the `train(ctx)` / `infer(ctx)` interface
- Additional files as needed (configs, weights, etc.)

The `registry/index.json` is an aggregated index with metadata for every model (name, version, description, framework, category, tags, dependencies, file list). Both the CLI and the web UI read this single JSON file to discover available models.

### Using a Custom Registry

1. Fork [open-model-registry](https://github.com/GACWR/open-model-registry)
2. Add your model directories under `models/`
3. Run `python scripts/build_index.py` to regenerate `index.json`
4. Push to your fork
5. Point the CLI or SDK to your fork's raw URL

## Web UI

The **Model Registry** page in the sidebar (Develop > Model Registry) provides:

- Browse all models with search and category/framework filters
- Click any model card to view full details, source code, dependencies, and tags
- Install models directly into a project from the UI
- Link to the model's GitHub page

Each model detail page shows:
- Full description
- Source code viewer (Monaco editor, read-only)
- Tags, dependencies, license, author
- Quick install command (click to copy)
- Install-to-project dialog
