//! Simple MLP training on synthetic data to prove the Rust training path works.
//!
//! Uses tch-rs (libtorch bindings) for tensor operations.
//! Task: classify 2D points into 4 quadrants.

use anyhow::Result;
use tch::{nn, nn::Module, nn::OptimizerConfig, Device, Kind, Tensor};
use tracing::info;

use crate::context::ModelContext;

/// Generate synthetic 2D classification data (4 quadrants).
fn generate_data(n: i64, device: Device) -> (Tensor, Tensor) {
    let x = Tensor::randn([n, 2], (Kind::Float, device));
    // Labels: quadrant index based on sign of x and y
    let x0 = x.narrow(1, 0, 1).squeeze_dim(1); // x coord
    let x1 = x.narrow(1, 1, 1).squeeze_dim(1); // y coord
    let labels = (x0.gt(0.0).to_kind(Kind::Int64) * 2) + x1.gt(0.0).to_kind(Kind::Int64);
    (x, labels)
}

/// Define a 3-layer MLP.
fn build_mlp(vs: &nn::Path) -> nn::Sequential {
    nn::seq()
        .add(nn::linear(vs / "fc1", 2, 64, Default::default()))
        .add_fn(|x| x.relu())
        .add(nn::linear(vs / "fc2", 64, 32, Default::default()))
        .add_fn(|x| x.relu())
        .add(nn::linear(vs / "fc3", 32, 4, Default::default()))
}

/// Train the MLP and log metrics back to the API.
pub fn train_mlp(ctx: &ModelContext, epochs: usize, lr: f64, batch_size: usize) -> Result<()> {
    let device = ctx.device;
    let vs = nn::VarStore::new(device);
    let model = build_mlp(&vs.root());
    let mut opt = nn::Adam::default().build(&vs, lr)?;

    let n_train: i64 = 2000;
    let n_val: i64 = 400;
    let (x_train, y_train) = generate_data(n_train, device);
    let (x_val, y_val) = generate_data(n_val, device);

    let n_batches = (n_train as usize + batch_size - 1) / batch_size;

    for epoch in 0..epochs {
        // Shuffle indices
        let perm = Tensor::randperm(n_train, (Kind::Int64, device));
        let x_shuffled = x_train.index_select(0, &perm);
        let y_shuffled = y_train.index_select(0, &perm);

        let mut epoch_loss = 0.0f64;
        let mut step = epoch * n_batches;

        for batch_idx in 0..n_batches {
            let start = (batch_idx * batch_size) as i64;
            let end = std::cmp::min(start + batch_size as i64, n_train);
            let xb = x_shuffled.narrow(0, start, end - start);
            let yb = y_shuffled.narrow(0, start, end - start);

            let logits = model.forward(&xb);
            let loss = logits.cross_entropy_for_logits(&yb);

            opt.backward_step(&loss);

            let loss_val: f64 = loss.double_value(&[]);
            epoch_loss += loss_val;
            step += 1;

            if batch_idx % 10 == 0 {
                ctx.log_metric("train_loss", loss_val, Some(step as i64), Some(epoch as i64));
            }
        }

        // Validation
        let val_logits = model.forward(&x_val);
        let val_loss: f64 = val_logits.cross_entropy_for_logits(&y_val).double_value(&[]);
        let val_pred = val_logits.argmax(1, false);
        let val_correct: f64 = val_pred.eq_tensor(&y_val).to_kind(Kind::Float).mean(Kind::Float).double_value(&[]);

        ctx.log_metric("val_loss", val_loss, None, Some(epoch as i64));
        ctx.log_metric("val_accuracy", val_correct, None, Some(epoch as i64));

        info!(
            "Epoch {}/{}: train_loss={:.4}, val_loss={:.4}, val_acc={:.2}%",
            epoch + 1, epochs,
            epoch_loss / n_batches as f64,
            val_loss,
            val_correct * 100.0
        );
    }

    // Save model weights
    let checkpoint_path = format!("/data/models/{}/checkpoint.pt", ctx.model_id);
    if let Err(e) = vs.save(&checkpoint_path) {
        info!("Could not save checkpoint to {checkpoint_path}: {e} (PVC may not be mounted)");
    }

    ctx.log_metric("training_complete", 1.0, None, None);
    info!("MLP training complete");
    Ok(())
}
