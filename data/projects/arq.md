---
mathjax: true
affiliations:
  - { name: 'Frank (Zequan) Wu', aff: ['Carnegie Mellon University', 'New York University'], url: 'https://zw2700.github.io/' }
  - { name: 'Mengye Ren',        aff: 'New York University' }
links:
  code: https://github.com/agentic-learning-ai-lab/arq
  poster: /assets/projects/arq/iclr2026-poster-arq.pdf
bibtex: |
  @inproceedings{wu2026local,
    title     = {Local Reinforcement Learning with Action-Conditioned Root Mean Squared Q-Functions},
    author    = {Wu, Frank and Ren, Mengye},
    booktitle = {International Conference on Learning Representations (ICLR)},
    year      = {2026},
    url       = {https://openreview.net/forum?id=pi4tbBMLsM}
  }
---

## Background & Motivation {data-toc=Motivation}

Backprop-based reinforcement learning (RL) relies on global error signals that are difficult to reconcile with biologically plausible learning. Recent local learning methods such as Forward-Forward show that meaningful representations can be learned without backpropagation, motivating their extension to RL. We propose Action-Conditioned RMS-Q (ARQ), a fully local, backprop-free RL algorithm that reformulates Q-learning using a vector-based, action-conditioned goodness objective. By estimating Q-values through layer-local RMS activations, ARQ removes architectural constraints present in prior local RL methods. Despite relying only on local updates, ARQ achieves competitive performance across standard RL benchmarks.

![](paradigm.png){width=750}

## Method

Inspired by the Forward-Forward algorithm's goodness function using layer activity statistics, we propose **Action-conditioned Root mean squared Q-Function (ARQ)**, a simple vector-based alternative to traditional scalar-based Q-value predictors designed for local RL.

ARQ is composed of two key ingredients:

- **RMS Goodness Function:** We extract value predictions from a vector of arbitrary size by computing the root mean squared (RMS) of the hidden layer activations: $g_l = \sqrt{\text{mean}(h_l^2)}$. This significantly improves expressivity by allowing more neurons at the output layer without sacrificing the backprop-free property.
- **Action Conditioning:** We insert an action candidate at the model input, enabling the network to produce representations specific to each state-action pair. This unleashes the capacity of the network compared to prior local methods that relied on dot-products between learned mappings.

ARQ can be readily implemented on top of [Artificial Dopamine (AD)](https://arxiv.org/abs/2405.15054), taking full advantage of their non-linearity and attention-like mechanisms while maintaining biological plausibility.

![](ad_msq.png){width=750}

![ARQ algorithm pseudocode.](pseudocode.png)

## Results

We evaluate ARQ on two challenging benchmarks designed to test RL algorithms in settings where local methods remain viable: [MinAtar](https://arxiv.org/pdf/1903.03176) (5 discrete action games) and the [DeepMind Control Suite](https://arxiv.org/pdf/1801.00690) (5 continuous control tasks).

**Key Findings:** ARQ consistently outperforms current local RL methods and **surpasses conventional backprop-based value-learning methods in most games**, demonstrating strong decision-making capabilities without relying on backpropagation. On MinAtar, ARQ shows particularly strong improvements on Breakout, SpaceInvaders, Seaquest, and Asterix. On DMC tasks, ARQ matches or exceeds the performance of SAC and TD-MPC2 while maintaining biological plausibility.

![Results table.](table.png){width=900}

## Analysis

### Effect of Action Conditioning at Input

We ablate on the effect of conditioning on our method. Our results show that without input-level action conditioning, the network struggles to differentiate between action-specific Q-values, leading to significantly degraded performance. This demonstrates that early fusion of action information is essential for learning meaningful state-action representations in a local learning framework. Interestingly, the benefits of action conditioning is only mild for AD, while being rather significant for ARQ.

![Action conditioning ablation.](cond.png)

### Representation Analysis: Effect of Action Conditioning

We visualize the hidden layer activations using 2-component PCA on the MinAtar Breakout environment.

**Key Observation:** Without action conditioning, activations cluster almost entirely by action identity and show no meaningful correlation with Q-values, indicating that action-related variance dominates the representation space. With action conditioning, representations become more state-driven and exhibit a mild positive relationship with Q-values, suggesting that the model can allocate capacity toward value-relevant structure rather than implicitly inferring action identity.

![Representation analysis.](conditioning.png){width=800}

### ARQ (RMS Goodness) vs. ARQ-MS (Mean-Squared Goodness)

We ablate on the choice of goodness function between ARQ and ARQ-MS. We find that ARQ produces moderate, stable goodness magnitudes throughout training, while ARQ-MS shows large initial spikes followed by sharply reduced variability. This suggests that the square root operation in RMS helps normalize the magnitude of activations, preventing numerical instability while maintaining the sensitivity to layer activities.

![RMS vs MS comparison.](rms.png){width=900}
