---
mathjax: true
affiliations:
  - { name: 'Mengye Ren', aff: 'New York University' }
links:
  code: https://github.com/agentic-learning-ai-lab/conceptual-creativity-meta-learning
italic_terms:
  - Creator
  - Appraiser
bibtex: |
  @inproceedings{ren2026seeking,
    title     = {Seeking the Unfamiliar but Memorable: Conceptual Creativity as Meta-Learning},
    author    = {Ren, Mengye},
    booktitle = {Advances in Neural Information Processing Systems (NeurIPS)},
    year      = {2026}
  }
---

## Overview

What does it mean to create a new concept, rather than retrieve a familiar one? Sampling a diffusion model many times at the same prompt gives variations with similar styles and typical content. We hypothesize that an artifact is creative for an observer if it is unfamiliar at first sight but quickly learnable through a brief adaptation. A stream of white noise is new yet has no structure to learn. At the other extreme, a square is fully understood but carries no novelty. A concept worth creating sits between these extremes, just beyond what the observer can currently predict.

![Creativity happens at the frontier of understanding. Existing concepts form a representation manifold built from past experience, and new concepts lie just beyond it.](intro-v2.png){width=480}

## Creator-Appraiser Meta-Learning {data-toc="Method"}

We turn this hypothesis into a bilevel optimization. A *Creator* $C$ proposes a candidate $c$. An *Appraiser* $A$, the adaptive observer, takes $T$ gradient steps on its fast weights $\phi$ to fit $c$. The Appraiser's improvement is the reward, and the Creator follows the gradient of this reward through the inner loop:

$$
\max_c \; \mathcal{L}_A(\phi_0, \theta; c) - \mathcal{L}_A(\phi_T, \theta; c).
$$

The initial loss $L_0$ measures unfamiliarity, and the drop to $L_T$ measures learnability. The fast weights are reset before every candidate, so the Appraiser meets each one as a first impression.

![The Creator-Appraiser framework. The Appraiser learns the candidate in the inner loop, while the Creator's goal in the outer loop is to make the candidate unfamiliar at first but learnable.](creator-appraiser.png){width=900}

We instantiate the Creator as a frozen diffusion model, and the Appraiser as an autoencoder on MNIST and as CLIP with a low-rank text adapter on natural images.

![The two Appraisers. On MNIST, the inner loop fine-tunes a decoder layer to reconstruct the candidate. On natural images, it fine-tunes a low-rank adapter on CLIP's text projection to match the candidate image.](diffusion-autoencoder-clip.png){width=900}

## MNIST

For an Appraiser trained only on digits, Greek and Korean characters are unfamiliar yet learnable, Gaussian noise is unfamiliar and unlearnable, and digits are familiar. The reward orders these stimuli as the hypothesis predicts, and our guided samples land in the region of high unfamiliarity and low residual error.

![The unfamiliarity–learnability plane. Our samples are moderately unfamiliar yet quickly learnable, while noise is unfamiliar and unlearnable.](frontier.png){width=720}

Among stimuli that are equally unfamiliar, the learning-progress term carries the signal: its rank correlation with the reward is 0.89, against −0.10 for unfamiliarity alone. As the guidance scale grows, samples move away from the ten digits while keeping coherent strokes.

![Guided samples at increasing guidance scale η.](grid-guidance-scale.png){width=720}

## Natural Images

With Stable Diffusion v1.5 as the Creator and no extra language conditioning, the meta-gradient moves the text embedding toward stylistic variations and concept compositions far from the vanilla samples.

![Curated outputs from the CLIP Appraiser (left four in each row) against vanilla Stable Diffusion (right two) for the same prompt.](clip-lora-picks.jpg){width=900}

The adapter rank sets how far the outputs move from the prompt. A larger rank gives the inner loop more capacity, which raises the reward and lowers the fraction of samples that a vision-language model judges on-prompt.

![Effect of LoRA rank on the inner-loop reward, frozen-CLIP similarity, and the on-prompt rate.](rank-tradeoff.png){width=560}

## Beyond Vanilla Sampling {data-toc="Baselines"}

We embed samples with DINOv2 and measure each sample's distance to the nearest of 1000 vanilla samples for the same prompt. Baselines reach comparable distances only at settings that keep fewer samples on-prompt. Even the most atypical of 1000 vanilla samples lies closer to the vanilla set than our typical on-prompt sample at rank 8.

<figure class="tw-text-center tw-my-10">
<div class="ccml-table-wrap">
<table class="ccml-table">
<thead>
<tr><th>Method</th><th>On-prompt rate</th><th>NN distance</th></tr>
</thead>
<tbody>
<tr><td>CFG scale 3–10</td><td>0.94–0.97</td><td>0.06–0.17</td></tr>
<tr><td>CFG scale 1</td><td>0.64</td><td>0.47</td></tr>
<tr><td>CFG scale 0.5</td><td>0.17</td><td>0.66</td></tr>
<tr><td>Negative prompt</td><td>0.95–0.96</td><td>0.10–0.12</td></tr>
<tr><td>ProCreate, γ = 250</td><td>0.73</td><td>0.38</td></tr>
<tr><td>ProCreate, γ = 500</td><td>0.28</td><td>0.58</td></tr>
<tr><td>ProCreate, γ = 1000</td><td>0.08</td><td>0.72</td></tr>
<tr><td>Vanilla, most atypical of 1000</td><td>–</td><td>0.52</td></tr>
<tr class="ours"><td><strong>Ours, rank 4</strong></td><td>0.64</td><td>0.42</td></tr>
<tr><td><strong>Ours, rank 8</strong></td><td>0.35</td><td>0.60</td></tr>
<tr><td><strong>Ours, rank 16</strong></td><td>0.22</td><td>0.66</td></tr>
<tr><td><strong>Ours, rank 32</strong></td><td>0.13</td><td>0.70</td></tr>
</tbody>
</table>
</div>
<figcaption class="tw-text-base tw-text-[var(--fg-muted)] tw-mt-4 tw-italic tw-inline-block tw-text-left">Diversity baselines on 20 prompts. On-prompt rate: fraction of samples with Qwen2.5-VL relevance ≥ 5. NN distance: median across prompts of the DINOv2 distance to the nearest of 1000 vanilla samples, on on-prompt samples.</figcaption>
</figure>

## Limitations

Our observers are computational. The Appraiser is CLIP-based, and DINOv2 and Qwen2.5-VL serve as independent evaluators. Whether people find the outputs creative, rather than only atypical, is the central open question, and a human study is the next step of this work. The CLIP Appraiser also does not enforce fidelity to the prompt, so the on-prompt rate falls as the adapter rank grows.
