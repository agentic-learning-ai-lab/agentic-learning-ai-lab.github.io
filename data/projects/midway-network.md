---
mathjax: true
affiliations:
  - { name: 'Chris Hoang', aff: 'New York University' }
  - { name: 'Mengye Ren',  aff: 'New York University' }
links:
  code: https://github.com/agentic-learning-ai-lab/midway-network
  huggingface: https://huggingface.co/agentic-learning-ai-lab/Midway-Network
bibtex: |
  @inproceedings{hoang:2026:midway-network,
    title     = {Midway Network: Learning Representations for Recognition and Motion from Latent Dynamics},
    author    = {Chris Hoang and Mengye Ren},
    booktitle = {International Conference on Learning Representations},
    year      = {2026}
  }
---

## Overview

Prior self-supervised learning (SSL) methods have focused on learning representations for *either* object recognition or motion understanding, not both. On the other hand, latent dynamics modeling has been used to acquire useful representations of visual observations and their transformations over time, i.e., motion, for control and planning tasks. In this work, we present **Midway Network**, a new SSL architecture that extends latent dynamics modeling to natural videos to learn strong visual representations for *both* object recognition and motion understanding. Midway Network handles the complex, multi-object scenes of natural videos by refining inferred motion latents hierarchically in a top-down manner and leveraging a dense forward prediction objective.

### Key contributions

- **New architecture**: The novel architecture components including dense forward prediction, hierarchical refinement of motion latents, and forward predictor gating units contribute to improved performance.
- **Downstream performance**: Midway Network achieves strong performance on both semantic segmentation and optical flow tasks compared to prior SSL methods (DynaMo, PooDLe, DoRA, CroCo v2, etc.).
- **Latent dynamics analysis**: We introduce a novel analysis method based on forwarded feature perturbation to interpret Midway Network's learned motion latents.

## Learning recognition *and* motion from natural videos {data-toc=Motivation}

![Comparison between iconic image SSL, dense video SSL, and our proposed Midway Network.](figure1.png){width=800}

Object recognition and motion understanding are two intertwined core components of perception, yet most prior work in visual SSL has only focused on *one* of the two aspects. Image SSL methods (a: [I-JEPA](https://arxiv.org/abs/2301.08243), [DINO](https://arxiv.org/abs/2104.14294), [MoCo](https://arxiv.org/abs/1911.05722), [SimCLR](https://arxiv.org/abs/2002.05709)) learn semantic representations from iconic, human-curated images, while video SSL methods (b: [PooDLe](https://arxiv.org/abs/2408.11208), [DoRA](https://arxiv.org/abs/2310.08584), [VINCE](https://arxiv.org/abs/2003.07990)) learn from natural videos, yet do not capture information on object motion. SSL methods for learning motion via pixel correspondence ([UFlow](https://arxiv.org/abs/2006.04902), [SMURF](https://arxiv.org/abs/2105.07014)) or cross-view reconstruction ([CroCo v2](https://arxiv.org/abs/2211.10408)) tasks result in poor recognition features. Drawing inspiration from control and planning ([DynaMo](https://arxiv.org/abs/2409.12192), [LAPA](https://arxiv.org/abs/2410.11758)), we propose to leverage latent dynamics modeling to learn representations of video frames and the dynamics between them, i.e., motion.

## Midway Network: hierarchical latent dynamics architecture {data-toc=Architecture}

![](model-figure.png){width=800}

Midway Network is centered around a *midway* path that infers motion latents, $m$, to describe the transformation between a source and target video frame. A vision encoder, e.g., vision transformer, extracts features, $z_t$, $z_{t+1}$, from the raw video frames and backward layers refine these features top-down. The forward dynamics model, conditioned on the source backward features, $v_t$, and inferred motion latents, predicts the dense target features. The prediction error, $||\hat{z}_{t+1} - z_{t+1}||^2_2$, jointly trains all components. Importantly, Midway Network leverages a hierarchical structure where the forward prediction objective is placed at multiple feature levels and predicted features from higher feature levels are used instead of source features to refine motion latents over lower feature levels, reminiscent of iterative refinement over feature pyramids in optical flow methods ([PWCNet](https://arxiv.org/abs/1709.02371), [UFlow](https://arxiv.org/abs/2006.04902)). Finally, to encourage the vision encoder to learn rich semantic features, we use a joint-embedding invariance objective such as DINO.

In standard transformer blocks, the input token is always propagated forward in the same position due to the residual connection, biasing the computation towards the identity. However, we wish for the forward dynamics model to learn if an object at a token(s) has moved, i.e., if its features can be computed from tokens at *other* positions. Thus, we introduce learnable gating units (MLPs), $g$, on the residual connection that output vector-wise gating weights between 0 and 1 such that the output of the attention stage is $h = g(x) \odot x + \text{Attention}(x)$. We use gating units in all but the first transformer block.

![](gating.png){width=400}

## Evaluations: semantic segmentation and optical flow {data-toc=Evaluations}

![Semantic segmentation (frozen readout) and optical flow (finetuning) evaluations after BDD100K pretraining.](results.png)

Midway Network is the only model to achieve strong performance on both semantic segmentation and optical flow tasks overall. Midway Network (enc. only)'s weak performance on optical flow indicates that the pretrained midway inverse and forward dynamics model weights capture useful information for motion estimation. We also demonstrate that downstream performance scales with larger model sizes from ViT-S to ViT-B. Please see Section 4.2 of the [paper](https://arxiv.org/abs/2510.05558) for more results from WT-Venice pretraining.

<figure class="tw-text-center tw-my-10">
  <video autoplay muted loop controls playsinline style="max-width: 500px; width: 100%; height: auto; margin: 0 auto; border-radius: 0.25rem;">
    <source src="/assets/projects/midway-network/bdd-semseg.mp4" type="video/mp4">
  </video>
  <figcaption class="tw-text-base tw-text-gray-600 tw-mt-4 tw-italic tw-max-w-2xl tw-mx-auto">Midway Network ViT-B UperNet readout on BDD100K semantic segmentation.</figcaption>
</figure>

![Midway Network ViT-S on FlyingThings and MPI-Sintel optical flow tasks after finetuning.](flow.png)

## Analysis: forwarded feature perturbation {data-toc=Analysis}

![Heatmap shows similarity of forwarded propagation to original propagation. Features are perturbed at green squares in Source (shown in Target at same position for reference). Bottom right (red border) shows that Midway Network without gating units exhibits identity bias.](heatmap-perturbation.png)

We introduce a novel analysis method based on forwarded feature perturbation to analyze the learned the motion latents. Using a trained Midway Network, we compute the source and target features and motion latents as usual. We then randomly perturb a token in the source features and perform forward prediction with the precomputed motion latents to propagate the perturbation to the target features. The cosine similarity between the perturbed and perturbation-propagated target features represents the sensitivity of each token in the target frame to the perturbation. In the examples above, we observe that the highest similarity regions in the target frame correctly match the initial pertubed position in the source frame. We also see that Midway Network without gating units learns the incorrect identity mapping even though the car has moved from the initial green square position.

![Token-level tracking by using forwarded feature propagation and/or feature similarity. Midway Network can track high-level regions such as the cyclist's foot (top row, pink square).](multi-perturbation.png)

We can also use forwarded feature perturbation to perform high-level tracking. Specifically, we iteratively propagate a selected token from a source frame to target frame and update the selected token to be the highest similarity token in the target frame. To reduce noise, we take the top-5 most similar tokens and select the token with highest feature similarity. Midway Network can roughly track high-level regions over time, whereas tracking with DINO-IN1K feature similarity quickly diverges.

## Conclusion and next steps {data-toc=Conclusion}

We have proposed Midway Network, a new SSL architecture that extends latent dynamics modeling to natural videos to learn strong visual representations for two core and complementary aspects of perception. Exciting next steps include scaling up training data and model size, leveraging the learned motion latents towards control and planning tasks, and improving latent dynamics modeling on natural videos.
