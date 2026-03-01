-- OpenModelStudio Seed Data — AI Research Platform
-- Run AFTER migrate.sql

BEGIN;

-- ============================================================
-- CLEANUP
-- ============================================================
DELETE FROM activity_log;
DELETE FROM notifications;
DELETE FROM artifacts;
DELETE FROM training_metrics;
DELETE FROM experiment_runs;
DELETE FROM experiments;
DELETE FROM inference_endpoints;
DELETE FROM workspaces;
DELETE FROM features;
DELETE FROM feature_groups;
DELETE FROM data_sources;
DELETE FROM jobs;
DELETE FROM datasets;
DELETE FROM model_versions;
DELETE FROM models;
DELETE FROM project_collaborators;
DELETE FROM projects;
DELETE FROM api_keys;
DELETE FROM search_history;
DELETE FROM templates;
DELETE FROM environments;
DELETE FROM users WHERE email LIKE 'e2e-%@test.io';
DELETE FROM users WHERE email LIKE '%@openmodel.studio';
DELETE FROM users WHERE email <> 'test@openmodel.studio';

-- ============================================================
-- USERS (admin only — all other data created via UI/tests)
-- ============================================================
INSERT INTO users (id, email, name, password_hash, role) VALUES
    ('53377d43-0f8f-4f65-855b-b0210453710c', 'test@openmodel.studio', 'Test User',
     '$argon2id$v=19$m=19456,t=2,p=1$hYz+69tUAILMxDJECPrRGw$UuzwzDYVXeFOVgy3JN/wBhUo6jW4DwGN4rKBjtc4ZOA', 'admin')
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- ============================================================
-- ENVIRONMENTS (static runtime configs needed for workspace launches)
-- ============================================================
INSERT INTO environments (id, name, description, docker_image, gpu_enabled, packages, created_by, cpu_limit, ram_limit, gpu_limit, clusters) VALUES
    ('e0000001-0000-0000-0000-000000000001',
     'PyTorch 2.1 + CUDA 12', 'Full PyTorch stack with CUDA 12.1, FlashAttention-2, and Triton kernels.',
     'nvidia/cuda:12.1-devel-ubuntu22.04', true,
     '["torch==2.1.0", "torchvision==0.16.0", "transformers==4.36.0", "flash-attn==2.4.2", "triton==2.1.0"]'::jsonb,
     '53377d43-0f8f-4f65-855b-b0210453710c',
     '8 cores', '32 GB', '1x A100', '["GPU A100", "GPU V100"]'::jsonb),
    ('e0000002-0000-0000-0000-000000000002',
     'JAX + TPU', 'JAX/Flax stack optimized for TPU training with distributed data parallelism.',
     'gcr.io/tpu-pytorch/xla:r2.1_3.10_tpuvm', true,
     '["jax[tpu]==0.4.23", "flax==0.8.0", "optax==0.1.9", "orbax==0.1.7"]'::jsonb,
     '53377d43-0f8f-4f65-855b-b0210453710c',
     '16 cores', '64 GB', NULL, '["TPU v4"]'::jsonb),
    ('e0000003-0000-0000-0000-000000000003',
     'Diffusers + DeepSpeed', 'HuggingFace Diffusers with DeepSpeed ZeRO-3 for large-scale diffusion training.',
     'nvidia/cuda:12.1-devel-ubuntu22.04', true,
     '["diffusers==0.25.0", "accelerate==0.26.0", "deepspeed==0.13.0", "xformers==0.0.23"]'::jsonb,
     '53377d43-0f8f-4f65-855b-b0210453710c',
     '32 cores', '256 GB', '8x A100', '["GPU A100", "GPU H100"]'::jsonb),
    ('e0000004-0000-0000-0000-000000000004',
     'Rust ML Stack', 'Rust-native ML with Candle and ONNX runtime for high-throughput inference.',
     'rust:1.75-bookworm', true,
     '["candle-core", "candle-nn", "tokenizers", "ort"]'::jsonb,
     '53377d43-0f8f-4f65-855b-b0210453710c',
     '16 cores', '64 GB', '1x A100', '["GPU A100", "GPU H100"]'::jsonb);

-- ============================================================
-- TEMPLATES (static starter configs)
-- ============================================================
INSERT INTO templates (name, description, category, config, difficulty, stars, icon, color) VALUES
    ('Video Generation (Diffusion)', 'Latent diffusion model for text-to-video generation with temporal attention.',
     'Generative', '{"framework": "pytorch", "base_model": "unet-3d"}'::jsonb, 'Advanced', 891, 'Video', 'violet'),
    ('Self-Supervised Video (JEPA)', 'Joint embedding predictive architecture for video representation learning.',
     'Self-Supervised', '{"framework": "pytorch", "base_model": "vit-l"}'::jsonb, 'Advanced', 723, 'Brain', 'blue'),
    ('World Model (MaskGIT)', 'Interactive world simulation from unlabeled video using masked generative transformers.',
     'Generative', '{"framework": "pytorch", "base_model": "maskgit"}'::jsonb, 'Expert', 567, 'Globe', 'emerald'),
    ('Temporal Reasoning', 'Causal temporal attention with memory banks for long-horizon video QA.',
     'Video Understanding', '{"framework": "pytorch", "base_model": "temporal-attn"}'::jsonb, 'Advanced', 456, 'Clock', 'amber'),
    ('Multimodal DiT', 'Joint denoising diffusion transformer across text, image, and audio modalities.',
     'Multimodal', '{"framework": "pytorch", "base_model": "mmdit"}'::jsonb, 'Expert', 1203, 'Sparkles', 'orange'),
    ('Neural Radiance Fields', 'NeRF from monocular video with learned depth priors and pose estimation.',
     '3D Vision', '{"framework": "pytorch", "base_model": "nerf"}'::jsonb, 'Intermediate', 342, 'Box', 'cyan'),
    ('LLM Fine-tuning (QLoRA)', 'Fine-tune LLMs with QLoRA 4-bit quantized training on video captions.',
     'NLP', '{"framework": "pytorch", "base_model": "llama-3"}'::jsonb, 'Advanced', 1456, 'FileText', 'red'),
    ('Video Action Recognition', 'ViT-based action recognition with temporal aggregation on Kinetics-700.',
     'Video Understanding', '{"framework": "pytorch", "base_model": "vivit"}'::jsonb, 'Intermediate', 234, 'Eye', 'pink');

COMMIT;
