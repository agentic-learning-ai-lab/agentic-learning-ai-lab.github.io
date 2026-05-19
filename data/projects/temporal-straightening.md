---
carousel: true
mathjax: true
equal_label: Equal advising
affiliations:
  - { name: 'Ying Wang',         aff: 'New York University' }
  - { name: 'Oumayma Bounou',    aff: 'New York University',   url: 'https://oumayb.github.io/' }
  - { name: 'Gaoyue Zhou',       aff: 'New York University',   url: 'https://gaoyuezhou.github.io/' }
  - { name: 'Randall Balestriero', aff: 'Brown University',    url: 'https://randallbalestriero.github.io/' }
  - { name: 'Tim G. J. Rudner', aff: 'University of Toronto',  url: 'https://timrudner.com/' }
  - { name: 'Yann LeCun',        aff: 'New York University',   url: 'http://yann.lecun.com/', equal: true }
  - { name: 'Mengye Ren',        aff: 'New York University',   equal: true }
links:
  code: https://github.com/agentic-learning-ai-lab/temporal-straightening
bibtex: |
  @article{wang2026temporal,
    title   = {Temporal Straightening for Latent Planning},
    author  = {Wang, Ying and Bounou, Oumayma and Zhou, Gaoyue and Balestriero, Randall and Rudner, Tim G. J. and LeCun, Yann and Ren, Mengye},
    journal = {arXiv preprint arXiv:2603.12231},
    year    = {2026}
  }
---

## Overview

![](wall_teaser.png){width=900}

## Method

Inspired by the perceptual straightening hypothesis in human vision, which posits that visual systems transform complex videos into straighter internal representations, we introduce a simple approach to straighten latent trajectories for planning. Concretely, we jointly learn an encoder and a predictor of a world model, while imposing regularization on the curvature of latent trajectories during training. The training objective is:

$$\mathcal{L}_{\text{pred}} = \lVert \hat{z}_{t+1} - \mathrm{sg}(z_{t+1}) \rVert_{2}^{2}$$

$$\mathcal{L}_{\text{curv}} = 1 - C, \quad \text{where } C = \cos(z_{t+1} - z_{t},\ z_{t+2} - z_{t+1})$$

$$\mathcal{L}_{\text{total}} = \mathcal{L}_{\text{pred}} + \lambda\, \mathcal{L}_{\text{curv}}$$

Here, $\mathrm{sg}$ denotes stop-gradient and $\lambda$ controls the strength of the straightening.

![Training and planning architecture.](architecture.png){width=900}

## How Good Is the Embedding Space? {data-toc=Embedding}

We inspect the learned embedding space by measuring latent trajectory curvatures, PCA projections of latent trajectories, and latent Euclidean distances to understand the impact of straightening.

<div class="ts-takeaway">
  <ol>
    <li><em>Implicit straightening</em> can happen when training the encoder using the predictor loss alone.</li>
    <li>Adding straightening regularization further decreases curvature of the resulting embeddings.</li>
    <li>Straightening encourages the latent Euclidean distance to better align with the geodesic distance.</li>
    <li>Near-perfect reconstruction can be attained with a very low feature dimensionality.</li>
  </ol>
</div>

![Latent curvature and open-loop GD success rate for different encoders. Higher cosine similarity indicates lower curvature.](curvature_bars.png){width=900}

We visualize the Euclidean distance between the embedding of a target state (denoted by the star) and all other states in the maze. Blue indicates smaller distance, red indicates larger distance.

<div class="ts-heatmap-grid">
  <figure><img src="/assets/projects/temporal-straightening/heatmaps/umaze_gt.png" alt="UMaze ground-truth heatmap"><figcaption>UMaze: ground-truth geodesic distance.</figcaption></figure>
  <figure><img src="/assets/projects/temporal-straightening/heatmaps/umaze_resnet_global.png" alt="UMaze ResNet global heatmap"><figcaption>UMaze: ResNet-global after straightening.</figcaption></figure>
  <figure><img src="/assets/projects/temporal-straightening/heatmaps/umaze_dino_cls.png" alt="UMaze DINO CLS heatmap"><figcaption>UMaze: DINO CLS.</figcaption></figure>
  <figure><img src="/assets/projects/temporal-straightening/heatmaps/umaze_dino_patch.png" alt="UMaze DINO patch heatmap"><figcaption>UMaze: DINO patch.</figcaption></figure>
  <figure><img src="/assets/projects/temporal-straightening/heatmaps/medium_gt.png" alt="Medium ground-truth heatmap"><figcaption>Medium: ground-truth geodesic distance.</figcaption></figure>
  <figure><img src="/assets/projects/temporal-straightening/heatmaps/medium_resnet_global.png" alt="Medium ResNet global heatmap"><figcaption>Medium: ResNet-global after straightening.</figcaption></figure>
  <figure><img src="/assets/projects/temporal-straightening/heatmaps/medium_dino_cls.png" alt="Medium DINO CLS heatmap"><figcaption>Medium: DINO CLS.</figcaption></figure>
  <figure><img src="/assets/projects/temporal-straightening/heatmaps/medium_dino_patch.png" alt="Medium DINO patch heatmap"><figcaption>Medium: DINO patch.</figcaption></figure>
</div>

We also visualize the learned trajectory representations using PCA. While latent trajectories are highly curved in the pretrained embedding space, they become significantly smoother after straightening, and Euclidean distance becomes a more faithful proxy for geodesic progress toward the goal.

<div class="project-carousel ts-pca-carousel">
  <div class="item"><img src="/assets/projects/temporal-straightening/pca/wall_exp_pca_mse.png" alt="Wall PCA overview"></div>
  <div class="item"><img src="/assets/projects/temporal-straightening/pca/wall_exp1_pca_mse.png" alt="Wall PCA example 1"></div>
  <div class="item"><img src="/assets/projects/temporal-straightening/pca/wall_exp2_pca_mse.png" alt="Wall PCA example 2"></div>
  <div class="item"><img src="/assets/projects/temporal-straightening/pca/wall_exp3_pca_mse.png" alt="Wall PCA example 3"></div>
  <div class="item"><img src="/assets/projects/temporal-straightening/pca/umaze_exp_pca_mse.png" alt="UMaze PCA overview"></div>
  <div class="item"><img src="/assets/projects/temporal-straightening/pca/umaze_exp1_pca_mse.png" alt="UMaze PCA example 1"></div>
  <div class="item"><img src="/assets/projects/temporal-straightening/pca/umaze_exp2_pca_mse.png" alt="UMaze PCA example 2"></div>
  <div class="item"><img src="/assets/projects/temporal-straightening/pca/umaze_exp3_pca_mse.png" alt="UMaze PCA example 3"></div>
  <div class="item"><img src="/assets/projects/temporal-straightening/pca/medium_exp1_pca_mse.png" alt="Medium PCA example 1"></div>
  <div class="item"><img src="/assets/projects/temporal-straightening/pca/medium_exp2_pca_mse.png" alt="Medium PCA example 2"></div>
  <div class="item"><img src="/assets/projects/temporal-straightening/pca/medium_exp3_pca_mse.png" alt="Medium PCA example 3"></div>
  <div class="item"><img src="/assets/projects/temporal-straightening/pca/pusht_exp_pca_mse.png" alt="PushT PCA overview"></div>
  <div class="item"><img src="/assets/projects/temporal-straightening/pca/pusht_exp1_pca_mse.png" alt="PushT PCA example 1"></div>
  <div class="item"><img src="/assets/projects/temporal-straightening/pca/pusht_exp2_pca_mse.png" alt="PushT PCA example 2"></div>
  <div class="item"><img src="/assets/projects/temporal-straightening/pca/pusht_exp3_pca_mse.png" alt="PushT PCA example 3"></div>
</div>

## Planning

We perform gradient-based planning using our models on four environments: Wall, PointMaze-UMaze, PointMaze-Medium, and PushT. We report both open-loop planning and closed-loop MPC. Open-loop planning optimizes a length-$H$ action sequence using the terminal embedding distance to the target, while MPC executes the first action and replans at every step. Across environments, temporal straightening substantially improves planning performance.

![Main planning results table.](results_table.png){width=1000}

Closed-loop MPC replans at every step. The success-rate curves below show that straightening reaches high MPC success quickly, especially on Wall and UMaze.

<div class="ts-quad-grid">
  <figure><img src="/assets/projects/temporal-straightening/mpc/wall_mpc.png" alt="Wall MPC results"><figcaption>Wall.</figcaption></figure>
  <figure><img src="/assets/projects/temporal-straightening/mpc/umaze_mpc.png" alt="UMaze MPC results"><figcaption>PointMaze-UMaze.</figcaption></figure>
  <figure><img src="/assets/projects/temporal-straightening/mpc/medium_mpc.png" alt="Medium MPC results"><figcaption>PointMaze-Medium.</figcaption></figure>
  <figure><img src="/assets/projects/temporal-straightening/mpc/pusht_mpc.png" alt="PushT MPC results"><figcaption>PushT.</figcaption></figure>
</div>

Below are examples of MPC planning across the four environments.

<div class="ts-quad-grid">
  <figure><video autoplay muted loop playsinline preload="auto"><source src="/assets/projects/temporal-straightening/wall.mp4" type="video/mp4"></video></figure>
  <figure><video autoplay muted loop playsinline preload="auto"><source src="/assets/projects/temporal-straightening/umaze.mp4" type="video/mp4"></video></figure>
  <figure><video autoplay muted loop playsinline preload="auto"><source src="/assets/projects/temporal-straightening/medium.mp4" type="video/mp4"></video></figure>
  <figure><video autoplay muted loop playsinline preload="auto"><source src="/assets/projects/temporal-straightening/pusht.mp4" type="video/mp4"></video></figure>
</div>

<div class="ts-quad-grid">
  <figure><video autoplay muted loop playsinline preload="auto"><source src="/assets/projects/temporal-straightening/wall2.mp4" type="video/mp4"></video></figure>
  <figure><video autoplay muted loop playsinline preload="auto"><source src="/assets/projects/temporal-straightening/umaze2.mp4" type="video/mp4"></video></figure>
  <figure><video autoplay muted loop playsinline preload="auto"><source src="/assets/projects/temporal-straightening/medium2.mp4" type="video/mp4"></video></figure>
  <figure><video autoplay muted loop playsinline preload="auto"><source src="/assets/projects/temporal-straightening/pusht2.mp4" type="video/mp4"></video></figure>
</div>

<div class="ts-quad-grid">
  <figure><video autoplay muted loop playsinline preload="auto"><source src="/assets/projects/temporal-straightening/wall3.mp4" type="video/mp4"></video></figure>
  <figure><video autoplay muted loop playsinline preload="auto"><source src="/assets/projects/temporal-straightening/umaze3.mp4" type="video/mp4"></video></figure>
  <figure><video autoplay muted loop playsinline preload="auto"><source src="/assets/projects/temporal-straightening/medium3.mp4" type="video/mp4"></video></figure>
  <figure><video autoplay muted loop playsinline preload="auto"><source src="/assets/projects/temporal-straightening/pusht3.mp4" type="video/mp4"></video></figure>
</div>
