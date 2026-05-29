---
mathjax: true
affiliations:
  - { name: 'Amelia (Hui) Dai', aff: ['New York University', 'The University of Chicago']}
  - { name: 'Ryan Teehan',      aff: 'New York University' }
  - { name: 'Parsa Torabian',   aff: 'Chronologies AI' }
  - { name: 'Mengye Ren',       aff: 'New York University' }
links:
  code: https://github.com/agentic-learning-ai-lab/beta-bernoulli-calibrator
  # poster: 
bibtex: |
  @misc{dai2026bbc,
    title         = {Aligning LLMs with Human Uncertainty: A Beta-Bernoulli Calibrator for LLM Forecasting},
    author        = {Dai, Hui and Teehan, Ryan and Torabian, Parsa and Ren, Mengye},
    year          = {2026},
    eprint        = {2605.27668},
    archivePrefix = {arXiv},
    primaryClass  = {cs.LG}
  }

---

## Overview

![Figure 1. Beta-Bernoulli Calibrator (BBC) is a lightweight, model-agnostic post-hoc calibrator that converts an LLM's verbalized point forecast into a mixture of Beta distributions over the latent event probability, trained on both binary outcomes and human forecasts. We model event probability, p ~ Σ_k w_k · Beta(α_k, β_k), with binary outcomes y ~ Bernoulli(p), and the mean p̂ = E[p] serves as the calibrated forecast and the variance û = Var[p] captures epistemic uncertainty.](pipeline.png){width=900}

## Motivation

LLMs are increasingly used for forecasting by prompting them for a verbalized probability of an event's likelihood, but even strong models struggle to match human crowds and tend to be overconfident. While human forecasts carry rich signal (the crowd estimate and the degree of consensus), prior work has underexplored this and trained only on binary outcomes. We ask: 

> *Beyond eliciting verbalized probabilities, how can we calibrate model forecasts using supervision from both binary outcomes and human forecasts?*

## Beta-Bernoulli-Calibrator

We model event probability as a mixture of Beta distributions, $p \sim \sum_k w_k \cdot \text{Beta}(\alpha_k, \beta_k)$, with binary outcomes $y \sim \text{Bernoulli}(p)$. Our goal is to learn the parameters of this distribution over $p$.

**Architecture.** As shown in Figure 1, BBC is a small language model with an MLP head. It takes in the forecasting question and an initial verbalized forecast from any input LLM, encodes them, and maps the final-token hidden state through the MLP head to predict the parameters of the Beta mixture. This design has two key benefits: (i) *Model-agnostic*: it works with any black-box input LLM, allowing us to utilize the reasoning ability of any strong models; (ii) *Lightweight*: a small 1B-parameter calibrator is effective, avoiding the overhead of fine-tuning the full input LLM.

**Loss.** Training combines supervision from binary outcomes and human forecasts:

$$\mathcal{L}_{\text{total}} = \sum_{i=1}^N \mathcal{L}_{\text{binary},i} + \sum_{i=1}^N \mathcal{L}_{\text{human},i}.$$

*Binary outcomes.* The binary loss reduces to binary cross-entropy on the mean $\hat{p}_i$:

$$\mathcal{L}_{\text{binary},i} = -y_i \log \hat{p}_i - (1 - y_i)\log(1 - \hat{p}_i).$$

*Human forecasts.* Treating human forecasts as noisy samples from the latent probability distribution, we match the predicted distribution to the human forecast histogram $\mathbf{h}_i$ via KL divergence:

$$\mathcal{L}_{\text{human},i} = \text{KL}\big(\mathbf{h}_i \,\|\, \text{Beta}(\alpha_i, \beta_i)\big).$$

## Main Results
Experiments on Metaculus and Polymarket data show that the Beta-Bernoulli Calibrator improves over raw verbalized LLM forecasts, traditional post-hoc calibration methods, and even some models specifically fine-tuned for forecasting (Table 1). Adding human forecast supervision further improves performance compared with training only on binary outcomes.

![Table 1. Test performance across input LLMs and baseline methods. Best results are bolded, and second-best results are underlined.](main_table.png){width=720}

Moreover, since our calibrator is a simple post-hoc method that works with any model, it can be stacked on top of models fine-tuned specifically for forecasting for further gains (Table 2).

![Table 2. Applying BBC (binary+human) on top of forecasting-specialized models further improves forecasts, with consistent gains in Brier score and AUC over other post-hoc calibration methods.](bbc_on_top.png){width=400}

## Epistemic Uncertainty

BBC quantifies epistemic uncertainty as the variance of its predicted Beta distribution. Plotting Brier score against ranked uncertainty shows this variance tracks forecasting error more reliable than self-reported verbalized confidence (noisy and disconnected from performance) or sampling-based variance (informative but degrades at high uncertainty).

![Figure 2. Brier score vs. ranked epistemic uncertainty, smoothed with a window of 300. (a) Verbalized confidence, (b) Sampling-based variance, and (c) Predicted Beta distribution variance.](u_vs_e.png){width=900}


## Out-of-Distribution Performance
Tested on an external Kalshi dataset (3,208 questions resolved after August 2025). Traditional post-hoc calibration methods fail to generalize and end up worse-calibrated, while BBC maintains strong calibration and discrimination, even beating the forecasting-specialized models on Brier and ECE.

![Table 3. OOD performance on the Kalshi dataset. BBC generalizes better than traditional post-hoc calibration methods, and achieves better calibration than forecasting-specialized models.](ood.png){width=400}