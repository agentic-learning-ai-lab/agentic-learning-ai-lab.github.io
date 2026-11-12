---
affiliations:
  - { name: 'Yanlai Yang', aff: 'New York University' }
  - { name: 'Minki Kang', aff: 'KAIST' }
  - { name: 'Divyam Madaan', aff: 'New York University' }
  - { name: 'Sung Ju Hwang', aff: ['KAIST', 'DeepAuto.ai'] }
  - { name: 'Mengye Ren', aff: 'New York University' }
links:
  pdf: https://openreview.net/pdf?id=udwqYC27uV
bibtex: |
  @inproceedings{yang2026empirical,
    title = {An Empirical Study of the Geometry and Latent-Space Composition of Hypernetwork-Generated LoRAs},
    author = {Yang, Yanlai and Kang, Minki and Madaan, Divyam and Hwang, Sung Ju and Ren, Mengye},
    booktitle = {Advances in Neural Information Processing Systems},
    year = {2026},
    url = {https://openreview.net/forum?id=udwqYC27uV},
  }
---

## Motivation

Hypernetworks such as Doc-to-LoRA (D2L) and SHINE turn a document into a LoRA adapter in a single forward pass, letting a frozen language model absorb new text without per-document fine-tuning. But keeping one adapter per document makes storage grow with the stream. Concatenating their low-rank factors also increases the output rank. **Can we combine many documents into one adapter at the original rank?**

Generated adapters are not the endpoints of independent fine-tuning runs: a shared generator decodes each one from an intermediate latent. We therefore combine the document latents **before decoding the weights**, then decode once.

## Geometry

Do generated adapters behave like directly fine-tuned LoRAs? We compare D2L on **Gemma-2-2B-it** and SHINE on **Qwen3-8B** with LoRAs fine-tuned on the same 500 SQuAD validation passages and corresponding backbones, using next-token prediction (NTP-FT) or QA supervised fine-tuning (QA-SFT).

![Pairwise distances between unit-Frobenius-normalized adapters, embedded in 2-D using metric MDS. Directly fine-tuned adapters form broad shells; generated adapters occupy compact regions, especially for SHINE. The embedding provides a qualitative view.](geometry.png){width=800}

![Cumulative uncentered spectral energy against the number of leading components. Generated adapters concentrate their energy in fewer directions. SHINE's leading component alone captures 88.8%.](spectrum.png){width=800}

The leading component captures **15.5%** of D2L's spectral energy, versus 0.6% (NTP-FT) and 1.5% (QA-SFT) on its backbone. For SHINE, it captures **88.8%**, versus 0.2% and 2.6%. Cross-document alignment is also stronger: after unit-norm normalization, mean pairwise cosine similarity is +0.144 for D2L and +0.888 for SHINE, compared with at most +0.025 for the directly fine-tuned adapters.

This shared structure, together with a common decoder, motivates testing the generator's latent space as a place to combine document knowledge.

## Method

![Latent Merger overview. A shared frozen hypernetwork encoder produces document latents. The trainable merger combines their mean with a gated, permutation-invariant residual; a frozen LoRA-generation head decodes one rank-r adapter for the frozen language model. The inset is schematic; projection and RMS-matching details are described below.](method-overview.png){width=1100}


Latent Merger treats the document latents as an unordered set. At each latent position, a small transformer mixes information across documents without positional embeddings, then mean-pools the result. It adds a gated, RMS-matched residual to the plain latent average. The output projection starts at zero, so **training begins at latent averaging**. The composition is permutation invariant by construction.

- **One fixed-rank adapter:** the frozen LoRA-generation head decodes the merged latent at the generator's original rank, regardless of the number of documents.
- **Only the merger is trained:** the language model, hypernetwork encoder, and generation head stay frozen. A separate merger is trained for each generator checkpoint.
- **Trained on SQuAD tuples:** the merger sees tuples of 2–5 training passages. We study both KL distillation from per-document adapters and cross-entropy on gold answers.

We evaluate the approach with D2L on Gemma-2-2B-it and SHINE on Qwen3-8B.

## Results

We evaluate on **SQuAD validation** and **MS MARCO**, which is out of distribution for the SQuAD-trained merger. Each method produces one adapter per tuple of N passages. The model answers every question in that tuple using the same adapter, without the passages in its prompt. This tests **per-document knowledge retention**, not reasoning that combines facts across documents.

The tables report **token-overlap F1 × 100 (mean ± 95% confidence interval)** for representative methods. These are not all asserted to have the same output rank. N = 10 exceeds the training tuple sizes. SVD denotes a rank-r approximation of the average weight update. Full results, including rank-concatenation and TIES baselines, appear in Tables 3–4 of the [paper](https://openreview.net/pdf?id=udwqYC27uV).

For context, using each question's own unmerged adapter scores **66.8 / 42.2** on SQuAD / MS MARCO for D2L and **56.8 / 38.1** for SHINE. Merging therefore still loses substantial information, particularly as N grows.

<div class="lm-table-wrap" tabindex="0" role="region" aria-label="Doc-to-LoRA · Gemma-2-2B-it, SQuAD results"><table class="lm-results"><caption>Doc-to-LoRA · Gemma-2-2B-it · SQuAD</caption><thead><tr><th scope="col">Method</th><th scope="col">N = 2</th><th scope="col">N = 5</th><th scope="col">N = 10</th></tr></thead><tbody><tr><th scope="row">Factor averaging</th><td>41.2 ± 2.7</td><td>19.8 ± 2.0</td><td>14.8 ± 1.6</td></tr><tr><th scope="row">SVD</th><td>48.5 ± 2.8</td><td>22.0 ± 2.1</td><td>15.5 ± 1.7</td></tr><tr><th scope="row">DARE</th><td>18.7 ± 2.3</td><td>17.0 ± 1.9</td><td>17.1 ± 1.4</td></tr><tr><th scope="row">Latent averaging</th><td>47.6 ± 2.8</td><td>25.2 ± 2.5</td><td>18.6 ± 1.7</td></tr><tr class="lm-ours"><th scope="row">Latent Merger (ours)</th><td>50.7 ± 2.8</td><td>29.8 ± 2.5</td><td>21.0 ± 1.3</td></tr></tbody></table></div>

<div class="lm-table-wrap" tabindex="0" role="region" aria-label="Doc-to-LoRA · Gemma-2-2B-it, MS MARCO results"><table class="lm-results"><caption>Doc-to-LoRA · Gemma-2-2B-it · MS MARCO</caption><thead><tr><th scope="col">Method</th><th scope="col">N = 2</th><th scope="col">N = 5</th><th scope="col">N = 10</th></tr></thead><tbody><tr><th scope="row">Factor averaging</th><td>29.5 ± 3.5</td><td>22.4 ± 2.1</td><td>19.7 ± 1.5</td></tr><tr><th scope="row">SVD</th><td>31.0 ± 3.5</td><td>23.2 ± 2.1</td><td>20.1 ± 1.5</td></tr><tr><th scope="row">DARE</th><td>19.2 ± 2.9</td><td>19.2 ± 1.9</td><td>19.5 ± 1.7</td></tr><tr><th scope="row">Latent averaging</th><td>31.3 ± 3.5</td><td>23.5 ± 2.2</td><td>20.7 ± 1.5</td></tr><tr class="lm-ours"><th scope="row">Latent Merger (ours)</th><td>32.0 ± 3.7</td><td>23.5 ± 2.0</td><td>22.2 ± 1.7</td></tr></tbody></table></div>

<div class="lm-table-wrap" tabindex="0" role="region" aria-label="SHINE · Qwen3-8B, SQuAD results"><table class="lm-results"><caption>SHINE · Qwen3-8B · SQuAD</caption><thead><tr><th scope="col">Method</th><th scope="col">N = 2</th><th scope="col">N = 5</th><th scope="col">N = 10</th></tr></thead><tbody><tr><th scope="row">Factor averaging</th><td>44.7 ± 3.1</td><td>29.5 ± 3.0</td><td>23.7 ± 2.6</td></tr><tr><th scope="row">SVD</th><td>44.6 ± 3.1</td><td>29.3 ± 3.0</td><td>23.6 ± 2.7</td></tr><tr><th scope="row">DARE</th><td>31.3 ± 4.1</td><td>27.5 ± 3.1</td><td>23.8 ± 2.8</td></tr><tr><th scope="row">Latent averaging</th><td>45.4 ± 3.0</td><td>30.6 ± 2.8</td><td>23.5 ± 2.5</td></tr><tr class="lm-ours"><th scope="row">Latent Merger (ours)</th><td>50.2 ± 4.2</td><td>39.8 ± 2.8</td><td>30.2 ± 2.5</td></tr></tbody></table></div>

<div class="lm-table-wrap" tabindex="0" role="region" aria-label="SHINE · Qwen3-8B, MS MARCO results"><table class="lm-results"><caption>SHINE · Qwen3-8B · MS MARCO</caption><thead><tr><th scope="col">Method</th><th scope="col">N = 2</th><th scope="col">N = 5</th><th scope="col">N = 10</th></tr></thead><tbody><tr><th scope="row">Factor averaging</th><td>26.7 ± 3.9</td><td>22.1 ± 2.0</td><td>20.1 ± 1.6</td></tr><tr><th scope="row">SVD</th><td>26.5 ± 3.7</td><td>22.2 ± 2.0</td><td>20.1 ± 1.6</td></tr><tr><th scope="row">DARE</th><td>31.8 ± 6.7</td><td>27.0 ± 3.6</td><td>26.0 ± 1.4</td></tr><tr><th scope="row">Latent averaging</th><td>29.5 ± 3.6</td><td>22.9 ± 2.1</td><td>20.9 ± 1.5</td></tr><tr class="lm-ours"><th scope="row">Latent Merger (ours)</th><td>33.5 ± 4.0</td><td>27.2 ± 2.2</td><td>25.8 ± 1.8</td></tr></tbody></table></div>

### Discussion

- **Learning improves on latent averaging, with uneven gains.** Latent Merger's mean matches or exceeds latent averaging in all 12 settings shown. The largest gains are on SHINE SQuAD: 30.6 → 39.8 at N = 5 and 23.5 → 30.2 at N = 10. For D2L, gains are smaller and the confidence intervals overlap at every N on both datasets.
- **The advantage is not universal.** On SHINE MS MARCO, DARE's confidence intervals overlap Latent Merger's at every N. At N = 10, their means are 26.0 and 25.8, respectively.
- **The comparison includes additional training.** Latent Merger is learned; the baselines shown are training-free. This is not an equal-training-budget comparison.

## Takeaway

For the two generators studied here, generated LoRAs are more aligned across documents and more spectrally concentrated than directly fine-tuned adapters. **Combining their latents and decoding once offers a promising route to a single fixed-rank document memory.** A learned merger improves retention over latent averaging, but scores remain below the per-document oracle and decline as more documents are combined. The evaluations focus on QA; non-QA and conflicting-source settings remain untested.

Read the full experimental setup, ablations, and limitations on [OpenReview](https://openreview.net/forum?id=udwqYC27uV).
