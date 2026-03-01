# Usage Guide

This walkthrough takes you from zero to a running ML experiment using the OpenModelStudio UI.

## Step 1 -- Log In

Open [http://localhost:31000](http://localhost:31000) and sign in with the default credentials:

| Email | Password |
|-------|----------|
| `test@openmodel.studio` | `Test1234` |

You land on the **Dashboard** with summary metrics and quick actions.

## Step 2 -- Create a Project

1. Click **Projects** in the sidebar
2. Click **+ New Project** (top-right)
3. Fill in:
   - **Name**: `Titanic Survival`
   - **Description**: `Predict passenger survival using Random Forest`
4. Click **Create**

Your project now appears in the project grid. All models, datasets, jobs, and experiments will live under this project.

## Step 3 -- Upload a Dataset

1. Click **Datasets** in the sidebar
2. Click **+ Upload Dataset**
3. Select your project (`Titanic Survival`)
4. Name it `titanic`
5. Upload your [`titanic.csv`](https://github.com/datasciencedojo/datasets/blob/master/titanic.csv) file (columns: `Survived`, `Pclass`, `Age`, `Fare`)
6. Click **Upload**

The dataset appears in the list with format, size, and version info.

## Step 4 -- Launch a JupyterLab Workspace

1. Click **Workspaces** in the sidebar
2. Click **+ Launch Workspace**
3. Select **JupyterLab** as the IDE
4. Select your project (`Titanic Survival`)
5. Click **Launch Workspace**

The platform provisions a Kubernetes pod with JupyterLab. Once ready, the workspace loads inline. A **welcome notebook** is pre-loaded with the end-to-end modeling workflow.

## Next Steps

Once your workspace is running, follow the [Modeling Guide](MODELING.md) to train, evaluate, and track models using the SDK.
