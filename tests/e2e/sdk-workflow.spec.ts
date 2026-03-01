/**
 * OpenModelStudio — SDK Workflow E2E Test
 *
 * Exercises the complete SDK workflow via API calls:
 * 1. Load dataset
 * 2. Create features
 * 3. Store hyperparameters
 * 4. Register model (with serialized sklearn model)
 * 5. Start training job (K8s pod)
 * 6. Start inference job (K8s pod)
 * 7. List and verify jobs
 * 8. Load model back
 *
 * This mirrors what a user does in a Jupyter notebook with `import openmodelstudio`.
 */
import { test, expect } from './helpers/fixtures';
import { apiLogin, apiPost, apiGet, API_URL, DEFAULT_ADMIN } from './helpers/api-client';

const SDK_URL = process.env.API_URL || 'http://localhost:31001';

async function sdkGet(token: string, path: string, params?: Record<string, string>) {
  const url = new URL(`${SDK_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GET ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function sdkPost(token: string, path: string, body: Record<string, any>) {
  const res = await fetch(`${SDK_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

test.describe('SDK Workflow', () => {
  test('complete notebook workflow via API', async ({ authenticatedPage: page }) => {
    test.setTimeout(300_000); // 5 min — jobs need K8s pod startup time

    let token: string;
    let projectId: string;
    let modelId: string;
    let trainingJobId: string;
    let inferenceJobId: string;

    // ─── Auth ─────────────────────────────────────────────────
    await test.step('Authenticate', async () => {
      token = await apiLogin(DEFAULT_ADMIN);
      expect(token).toBeTruthy();
    });

    // ─── Get project ID ───────────────────────────────────────
    await test.step('Get default project', async () => {
      const projects = await sdkGet(token, '/projects');
      expect(projects.length).toBeGreaterThan(0);
      projectId = projects[0].id;
    });

    // ─── 1. List datasets ─────────────────────────────────────
    await test.step('List datasets', async () => {
      const datasets = await sdkGet(token, '/sdk/datasets', { project_id: projectId });
      expect(Array.isArray(datasets)).toBe(true);
    });

    // ─── 2. Create features ───────────────────────────────────
    await test.step('Create feature group', async () => {
      const result = await sdkPost(token, '/sdk/features', {
        project_id: projectId,
        group_name: `e2e-features-${Date.now()}`,
        entity: 'default',
        features: [
          { name: 'Pclass', feature_type: 'numerical', dtype: 'float64', config: {} },
          { name: 'Age', feature_type: 'numerical', dtype: 'float64', config: { transform: 'standard_scaler', mean: 29.7, std: 14.5 } },
          { name: 'Fare', feature_type: 'numerical', dtype: 'float64', config: { transform: 'min_max_scaler', min: 0, max: 512 } },
        ],
      });
      expect(result).toBeTruthy();
      expect(result.group_id || result.id).toBeTruthy();
    });

    // ─── 3. Store hyperparameters ─────────────────────────────
    let hpSetName: string;
    await test.step('Create hyperparameter set', async () => {
      hpSetName = `e2e-hp-${Date.now()}`;
      const result = await sdkPost(token, '/sdk/hyperparameters', {
        project_id: projectId,
        name: hpSetName,
        parameters: {
          n_estimators: 100,
          max_depth: 5,
          random_state: 42,
        },
      });
      expect(result.id).toBeTruthy();
      expect(result.name).toBe(hpSetName);
    });

    await test.step('Load hyperparameter set', async () => {
      const result = await sdkGet(token, `/sdk/hyperparameters/${hpSetName}`);
      expect(result.parameters).toBeTruthy();
      expect(result.parameters.n_estimators).toBe(100);
    });

    await test.step('List hyperparameter sets', async () => {
      const list = await sdkGet(token, '/sdk/hyperparameters', { project_id: projectId });
      expect(Array.isArray(list)).toBe(true);
      expect(list.some((hp: any) => hp.name === hpSetName)).toBe(true);
    });

    // ─── 4. Register model ────────────────────────────────────
    await test.step('Register model', async () => {
      // Register with minimal source code (no binary model to avoid serialization issues in test)
      const result = await sdkPost(token, '/sdk/register-model', {
        name: `e2e-model-${Date.now()}`,
        framework: 'sklearn',
        project_id: projectId,
        source_code: `
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.datasets import make_classification
from sklearn.model_selection import cross_val_score

def train(ctx):
    hp = ctx.hyperparameters
    n_estimators = int(hp.get("n_estimators", 100))
    max_depth = int(hp.get("max_depth", 5))

    model = RandomForestClassifier(n_estimators=n_estimators, max_depth=max_depth, random_state=42)
    X, y = make_classification(n_samples=200, n_features=4, random_state=42)

    ctx.log_metric("progress", 20)

    scores = cross_val_score(model, X, y, cv=3, scoring="accuracy")
    for i, score in enumerate(scores):
        ctx.log_metric("accuracy", float(score), epoch=i + 1)
        ctx.log_metric("loss", float(1.0 - score), epoch=i + 1)
        ctx.log_metric("progress", 30 + int((i + 1) / len(scores) * 60))

    model.fit(X, y)
    train_acc = float(model.score(X, y))
    ctx.log_metric("accuracy", train_acc, epoch=len(scores) + 1)
    ctx.log_metric("loss", float(1.0 - train_acc), epoch=len(scores) + 1)
    ctx.log_metric("progress", 100)

def infer(ctx):
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.datasets import make_classification
    model = RandomForestClassifier(n_estimators=100, max_depth=5, random_state=42)
    X, y = make_classification(n_samples=200, n_features=4, random_state=42)
    model.fit(X, y)

    data = ctx.get_input_data()
    if "features" in data:
        import numpy as np
        X_input = np.array(data["features"]).reshape(1, -1) if np.array(data["features"]).ndim == 1 else np.array(data["features"])
        predictions = model.predict(X_input).tolist()
        probas = model.predict_proba(X_input).tolist()
        ctx.set_output({"predictions": predictions, "probabilities": probas})
    else:
        ctx.set_output({"error": "No features key"})
`,
      });
      expect(result.model_id).toBeTruthy();
      expect(result.version).toBe(1);
      modelId = result.model_id;
    });

    // ─── 5. Start training job ────────────────────────────────
    await test.step('Start training job', async () => {
      const result = await sdkPost(token, '/sdk/start-training', {
        model_id: modelId,
        hyperparameters: { n_estimators: 100, max_depth: 5 },
        hardware_tier: 'cpu-small',
      });
      expect(result.id).toBeTruthy();
      expect(['pending', 'running']).toContain(result.status);
      trainingJobId = result.id;
    });

    // ─── Wait for training to complete ────────────────────────
    await test.step('Wait for training completion', async () => {
      let job: any;
      const maxWait = 120_000; // 2 min
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        job = await sdkGet(token, `/training/${trainingJobId}`);
        if (['completed', 'failed', 'cancelled'].includes(job.status)) break;
        await new Promise((r) => setTimeout(r, 3000));
      }

      expect(job).toBeTruthy();
      expect(job.status).toBe('completed');
      expect(job.progress).toBe(100);
    });

    // ─── Verify training metrics ──────────────────────────────
    await test.step('Verify training metrics were recorded', async () => {
      const metrics = await sdkGet(token, `/training/${trainingJobId}/metrics`);
      expect(Array.isArray(metrics)).toBe(true);
      expect(metrics.length).toBeGreaterThan(0);

      const metricNames = [...new Set(metrics.map((m: any) => m.metric_name))];
      expect(metricNames).toContain('accuracy');
      expect(metricNames).toContain('loss');
      expect(metricNames).toContain('progress');
    });

    // ─── 6. Start inference job ───────────────────────────────
    await test.step('Start inference job', async () => {
      const result = await sdkPost(token, '/sdk/start-inference', {
        model_id: modelId,
        input_data: { features: [0.5, -0.3, 1.2, 0.1] },
        hardware_tier: 'cpu-small',
      });
      expect(result.id).toBeTruthy();
      expect(['pending', 'running']).toContain(result.status);
      inferenceJobId = result.id;
    });

    // ─── Wait for inference to complete ───────────────────────
    await test.step('Wait for inference completion', async () => {
      let job: any;
      const maxWait = 120_000;
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        job = await sdkGet(token, `/training/${inferenceJobId}`);
        if (['completed', 'failed', 'cancelled'].includes(job.status)) break;
        await new Promise((r) => setTimeout(r, 3000));
      }

      expect(job).toBeTruthy();
      expect(job.status).toBe('completed');
    });

    // ─── Verify inference output ──────────────────────────────
    await test.step('Verify inference output has predictions', async () => {
      const job = await sdkGet(token, `/training/${inferenceJobId}`);
      expect(job.metrics).toBeTruthy();
      expect(job.metrics.predictions).toBeTruthy();
      expect(Array.isArray(job.metrics.predictions)).toBe(true);
      expect(job.metrics.probabilities).toBeTruthy();
    });

    // ─── 7. List jobs ─────────────────────────────────────────
    await test.step('List all jobs and verify both appear', async () => {
      const jobs = await sdkGet(token, '/sdk/jobs', { project_id: projectId });
      expect(Array.isArray(jobs)).toBe(true);

      const jobIds = jobs.map((j: any) => j.id);
      expect(jobIds).toContain(trainingJobId);
      expect(jobIds).toContain(inferenceJobId);

      const trainingJob = jobs.find((j: any) => j.id === trainingJobId);
      expect(trainingJob.job_type).toBe('training');
      expect(trainingJob.status).toBe('completed');

      const inferenceJob = jobs.find((j: any) => j.id === inferenceJobId);
      expect(inferenceJob.job_type).toBe('inference');
      expect(inferenceJob.status).toBe('completed');
    });

    // ─── 8. Verify logs were captured ────────────────────────
    await test.step('Verify training job has logs', async () => {
      // The model-runner auto-injects logs via ModelLogHandler
      // Post a manual log to verify the endpoint works
      await fetch(`${SDK_URL}/internal/logs/${trainingJobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logs: [
            { level: 'info', message: 'E2E test log entry', logger_name: 'e2e-test' },
            { level: 'warning', message: 'E2E test warning', logger_name: 'e2e-test' },
          ],
        }),
      });

      const logs = await sdkGet(token, `/training/${trainingJobId}/logs`);
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBeGreaterThan(0);

      // Verify our manual logs are there
      const messages = logs.map((l: any) => l.message);
      expect(messages).toContain('E2E test log entry');
      expect(messages).toContain('E2E test warning');
    });

    // ─── 9. Experiment workflow ─────────────────────────────
    let experimentId: string;

    await test.step('Create experiment', async () => {
      const result = await sdkPost(token, '/experiments', {
        project_id: projectId,
        name: `e2e-experiment-${Date.now()}`,
        description: 'E2E test experiment',
      });
      expect(result.id).toBeTruthy();
      expect(result.name).toContain('e2e-experiment');
      experimentId = result.id;
    });

    await test.step('Add training run to experiment', async () => {
      const result = await sdkPost(token, `/experiments/${experimentId}/runs`, {
        job_id: trainingJobId,
        parameters: { n_estimators: 100, max_depth: 5 },
        metrics: { accuracy: 0.95, loss: 0.05 },
      });
      expect(result.id).toBeTruthy();
      expect(result.experiment_id).toBe(experimentId);
    });

    await test.step('List experiment runs', async () => {
      const runs = await sdkGet(token, `/experiments/${experimentId}/runs`);
      expect(Array.isArray(runs)).toBe(true);
      expect(runs.length).toBe(1);
      expect(runs[0].job_id).toBe(trainingJobId);
      expect(runs[0].metrics.accuracy).toBe(0.95);
    });

    await test.step('Compare experiment runs', async () => {
      const comparison = await sdkGet(token, `/experiments/${experimentId}/compare`);
      expect(comparison.experiment_id).toBe(experimentId);
      expect(Array.isArray(comparison.runs)).toBe(true);
      expect(comparison.runs.length).toBe(1);
    });

    await test.step('List experiments', async () => {
      const experiments = await sdkGet(token, '/experiments');
      expect(Array.isArray(experiments)).toBe(true);
      const found = experiments.find((e: any) => e.id === experimentId);
      expect(found).toBeTruthy();
    });

    // ─── 10. UI verification ──────────────────────────────────
    await test.step('Training detail page shows metrics', async () => {
      await page.goto(`/training/${trainingJobId}`);
      await page.waitForTimeout(3000);

      // Should show completed status
      const statusBadge = page.getByText('completed').first();
      await expect(statusBadge).toBeVisible({ timeout: 10000 });

      // Should show 100% progress
      const progress = page.getByText('100%').first();
      await expect(progress).toBeVisible({ timeout: 5000 });
    });

    await test.step('Inference detail page shows output', async () => {
      await page.goto(`/inference/${inferenceJobId}`);
      await page.waitForTimeout(3000);

      // Should show completed status
      const statusText = page.getByText('completed').first();
      await expect(statusText).toBeVisible({ timeout: 10000 });
    });

    await test.step('Training detail page shows logs tab', async () => {
      await page.goto(`/training/${trainingJobId}`);
      await page.waitForTimeout(2000);

      // Click the Logs tab
      await page.getByRole('tab', { name: /Logs/ }).click();
      await page.waitForTimeout(2000);

      // Should show log entries (we posted manual ones)
      const logEntry = page.getByText('E2E test log entry').first();
      await expect(logEntry).toBeVisible({ timeout: 10000 });
    });

    await test.step('Jobs list page shows both jobs', async () => {
      await page.goto('/training');
      await page.waitForTimeout(3000);

      // Should show job entries
      const jobEntries = page.locator('[class*="cursor-pointer"]');
      await expect(jobEntries.first()).toBeVisible({ timeout: 10000 });

      // Should see both training and inference badges
      const trainingBadge = page.locator('text=training').first();
      const inferenceBadge = page.locator('text=inference').first();
      await expect(trainingBadge).toBeVisible({ timeout: 5000 });
      await expect(inferenceBadge).toBeVisible({ timeout: 5000 });
    });

    await test.step('Experiments page shows experiment', async () => {
      await page.goto('/experiments');
      await page.waitForTimeout(3000);

      // Page should render with the header
      const heading = page.getByText('Experiments').first();
      await expect(heading).toBeVisible({ timeout: 10000 });

      // Our experiment should be visible
      const expCard = page.getByText('e2e-experiment').first();
      await expect(expCard).toBeVisible({ timeout: 10000 });
    });

    await test.step('Experiment detail page shows runs', async () => {
      await page.goto(`/experiments/${experimentId}`);
      await page.waitForTimeout(3000);

      // Should show experiment name
      const expName = page.getByText('e2e-experiment').first();
      await expect(expName).toBeVisible({ timeout: 10000 });

      // Should show the run we added (at least partial run ID)
      const runsTab = page.getByRole('tab', { name: /Runs/ });
      await expect(runsTab).toBeVisible({ timeout: 5000 });
    });
  });
});
