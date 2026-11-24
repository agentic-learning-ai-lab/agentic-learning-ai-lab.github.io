---
publication_notice: 40th Conference on Neural Information Processing Systems (NeurIPS 2026).
website:
  url: https://agenticlearning.ai/latent-merger
  label: agenticlearning.ai/latent-merger
affiliations:
  - { name: 'Yanlai Yang', aff: 'New York University' }
  - { name: 'Minki Kang', aff: 'KAIST' }
  - { name: 'Divyam Madaan', aff: 'New York University' }
  - { name: 'Sung Ju Hwang', aff: ['KAIST', 'DeepAuto.ai'] }
  - { name: 'Mengye Ren', aff: 'New York University' }
links:
  pdf: https://cdn.agenticlearning.ai/c87844af59479499/latent-merger-2026.pdf
  code: https://github.com/agentic-learning-ai-lab/latent-merger
bibtex: |
  @inproceedings{yang2026empirical,
    title = {Latent Merger: Latent-Space Composition of Hypernetwork-Generated LoRAs},
    author = {Yang, Yanlai and Kang, Minki and Madaan, Divyam and Hwang, Sung Ju and Ren, Mengye},
    booktitle = {Advances in Neural Information Processing Systems},
    year = {2026},
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

The tables report **token-overlap F1 × 100 (mean ± 95% confidence interval)** for representative methods. These are not all asserted to have the same output rank. N = 10 exceeds the training tuple sizes. SVD denotes a rank-r approximation of the average weight update. Full results, including rank-concatenation and TIES baselines, appear in Tables 3–4 of the [paper](https://cdn.agenticlearning.ai/c87844af59479499/latent-merger-2026.pdf).

For context, using each question's own unmerged adapter scores **66.8 / 42.2** on SQuAD / MS MARCO for D2L and **56.8 / 38.1** for SHINE. Merging therefore still loses substantial information, particularly as N grows.

<figure class="paper-fig">
<figcaption class="paper-cap"><strong>Doc-to-LoRA, Gemma-2-2B-it.</strong> Token-overlap F1 × 100, mean ± 95% CI, for N documents merged into one adapter. Bold: best among the methods shown.</figcaption>
<div class="paper-scroll">
<table class="paper-table">
<thead>
<tr><th></th><th colspan="3" class="c cm">SQuAD</th><th colspan="3" class="c cm">MS MARCO</th></tr>
<tr><th>Method</th><th class="s">N = 2</th><th class="s">N = 5</th><th class="s">N = 10</th><th class="s">N = 2</th><th class="s">N = 5</th><th class="s">N = 10</th></tr>
</thead>
<tbody>
<tr><td>Factor averaging</td><td>41.2<span class="sd">±2.7</span></td><td>19.8<span class="sd">±2.0</span></td><td>14.8<span class="sd">±1.6</span></td><td>29.5<span class="sd">±3.5</span></td><td>22.4<span class="sd">±2.1</span></td><td>19.7<span class="sd">±1.5</span></td></tr>
<tr><td>SVD</td><td>48.5<span class="sd">±2.8</span></td><td>22.0<span class="sd">±2.1</span></td><td>15.5<span class="sd">±1.7</span></td><td>31.0<span class="sd">±3.5</span></td><td>23.2<span class="sd">±2.1</span></td><td>20.1<span class="sd">±1.5</span></td></tr>
<tr><td>DARE</td><td>18.7<span class="sd">±2.3</span></td><td>17.0<span class="sd">±1.9</span></td><td>17.1<span class="sd">±1.4</span></td><td>19.2<span class="sd">±2.9</span></td><td>19.2<span class="sd">±1.9</span></td><td>19.5<span class="sd">±1.7</span></td></tr>
<tr><td>Latent averaging</td><td>47.6<span class="sd">±2.8</span></td><td>25.2<span class="sd">±2.5</span></td><td>18.6<span class="sd">±1.7</span></td><td>31.3<span class="sd">±3.5</span></td><td><strong>23.5</strong><span class="sd">±2.2</span></td><td>20.7<span class="sd">±1.5</span></td></tr>
<tr class="ours"><td>Latent Merger (ours)</td><td><strong>50.7</strong><span class="sd">±2.8</span></td><td><strong>29.8</strong><span class="sd">±2.5</span></td><td><strong>21.0</strong><span class="sd">±1.3</span></td><td><strong>32.0</strong><span class="sd">±3.7</span></td><td><strong>23.5</strong><span class="sd">±2.0</span></td><td><strong>22.2</strong><span class="sd">±1.7</span></td></tr>
</tbody>
</table>
</div>
</figure>

<figure class="paper-fig">
<figcaption class="paper-cap"><strong>SHINE, Qwen3-8B.</strong> Token-overlap F1 × 100, mean ± 95% CI, for N documents merged into one adapter. Bold: best among the methods shown.</figcaption>
<div class="paper-scroll">
<table class="paper-table">
<thead>
<tr><th></th><th colspan="3" class="c cm">SQuAD</th><th colspan="3" class="c cm">MS MARCO</th></tr>
<tr><th>Method</th><th class="s">N = 2</th><th class="s">N = 5</th><th class="s">N = 10</th><th class="s">N = 2</th><th class="s">N = 5</th><th class="s">N = 10</th></tr>
</thead>
<tbody>
<tr><td>Factor averaging</td><td>44.7<span class="sd">±3.1</span></td><td>29.5<span class="sd">±3.0</span></td><td>23.7<span class="sd">±2.6</span></td><td>26.7<span class="sd">±3.9</span></td><td>22.1<span class="sd">±2.0</span></td><td>20.1<span class="sd">±1.6</span></td></tr>
<tr><td>SVD</td><td>44.6<span class="sd">±3.1</span></td><td>29.3<span class="sd">±3.0</span></td><td>23.6<span class="sd">±2.7</span></td><td>26.5<span class="sd">±3.7</span></td><td>22.2<span class="sd">±2.0</span></td><td>20.1<span class="sd">±1.6</span></td></tr>
<tr><td>DARE</td><td>31.3<span class="sd">±4.1</span></td><td>27.5<span class="sd">±3.1</span></td><td>23.8<span class="sd">±2.8</span></td><td>31.8<span class="sd">±6.7</span></td><td>27.0<span class="sd">±3.6</span></td><td><strong>26.0</strong><span class="sd">±1.4</span></td></tr>
<tr><td>Latent averaging</td><td>45.4<span class="sd">±3.0</span></td><td>30.6<span class="sd">±2.8</span></td><td>23.5<span class="sd">±2.5</span></td><td>29.5<span class="sd">±3.6</span></td><td>22.9<span class="sd">±2.1</span></td><td>20.9<span class="sd">±1.5</span></td></tr>
<tr class="ours"><td>Latent Merger (ours)</td><td><strong>50.2</strong><span class="sd">±4.2</span></td><td><strong>39.8</strong><span class="sd">±2.8</span></td><td><strong>30.2</strong><span class="sd">±2.5</span></td><td><strong>33.5</strong><span class="sd">±4.0</span></td><td><strong>27.2</strong><span class="sd">±2.2</span></td><td>25.8<span class="sd">±1.8</span></td></tr>
</tbody>
</table>
</div>
</figure>

### Discussion

- **Learning improves on latent averaging, with uneven gains.** Latent Merger's mean matches or exceeds latent averaging in all 12 settings shown. The largest gains are on SHINE SQuAD: 30.6 → 39.8 at N = 5 and 23.5 → 30.2 at N = 10. For D2L, gains are smaller and the confidence intervals overlap at every N on both datasets.
- **The advantage is not universal.** On SHINE MS MARCO, DARE's confidence intervals overlap Latent Merger's at every N. At N = 10, their means are 26.0 and 25.8, respectively.
- **The comparison includes additional training.** Latent Merger is learned; the baselines shown are training-free. This is not an equal-training-budget comparison.

## Takeaway

For the two generators studied here, generated LoRAs are more aligned across documents and more spectrally concentrated than directly fine-tuned adapters. **Combining their latents and decoding once offers a promising route to a single fixed-rank document memory.** A learned merger improves retention over latent averaging, but scores remain below the per-document oracle and decline as more documents are combined. The evaluations focus on QA; non-QA and conflicting-source settings remain untested.

Read the full experimental setup, ablations, and limitations in the [full paper](/research/latent-merger/).
