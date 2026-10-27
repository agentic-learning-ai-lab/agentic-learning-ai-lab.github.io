---
mathjax: true
affiliations:
  - { name: 'Jinran Jin',  aff: 'New York University' }
  - { name: 'Ryan Teehan', aff: 'New York University' }
  - { name: 'Jack Lu',     aff: 'New York University' }
  - { name: 'Mengye Ren',  aff: 'New York University' }
italic_terms:
  - PrompTo
bibtex: |
  @misc{jin2026prompto,
    title  = {What is it like to write like Haiku?},
    author = {Jin, Jinran and Teehan, Ryan and Lu, Jack and Ren, Mengye},
    note   = {Preprint},
    year   = {2026}
  }
---

## Overview

We say that a description of a model's style is complete if a model that has never seen the original can reproduce the style from the description alone. No prior work both describes a model's style and reproduces it. We close this gap with *PrompTo*, a framework that searches for a complete description of a target model's style and tests it by reproduction. The description is in the format of a system prompt, which we call a **style prompt**.

## Method

![The PrompTo framework for stylistic transfer. Top: the source model answers X under a trainable style prompt π to generate the restyled text Y′ₛ. The target model answers X and held-out Xₐ to generate Yₜ and Yₐ. Discriminator D picks which of Y′ₛ, Yₜ is closer in style to Yₐ. The reflector R proposes updated π based on D's reasoning. Bottom: Qwen2.5-7B → Gemma3-4B on ELI5. Bold text shows the style of the target model.](framework.png)

Each iteration does three things: generating restyled responses under $\pi$; evaluating $\pi$ with an LLM discriminator; proposing updated $\pi$ with a reflection model using the discriminator's reasoning and failure cases. For each question, the discriminator $D$ receives the restyled response $Y'_s$, the target response $Y_t$ to the same question, and $n$ anchor responses $Y_a$ from the target model on different questions, and selects the response closer in style to the anchors. The fool rate is the probability that $D$ predicts $Y'_s$ as being more similar to $Y_a$.

## Results

Across 13 directions on 2 datasets, the optimized style prompts recover **74.8%** of the source–target gap on the LLM discriminators, against at most **15.2%** for any baseline. The authorship-verification classifier and STAR style embeddings agree. A model name alone carries no style property. Examples or a simple description without revision carry a little style information. Only *PrompTo*'s style prompt, which is optimized with a discriminator, carries most of it.

<figure class="tw-text-center tw-my-10">
<div class="prompto-table-wrap">
<table class="prompto-table">
<thead>
<tr><th>Method</th><th>Fool rate (%)</th><th>Fool rate SGR (%)</th><th>AV ratio (%)</th><th>Cos. sim.</th></tr>
</thead>
<tbody>
<tr><td>Vanilla</td><td>9.2</td><td>–</td><td>0.9</td><td>0.767</td></tr>
<tr><td>Generic</td><td>3.5</td><td>−21.3</td><td>6.1</td><td>0.692</td></tr>
<tr><td>Few-shot</td><td>14.5</td><td>15.2</td><td>10.3</td><td>0.772</td></tr>
<tr><td>Single-pass</td><td>16.6</td><td>13.8</td><td>19.5</td><td>0.769</td></tr>
<tr class="ours"><td><strong>PrompTo (ours)</strong></td><td><strong>43.8</strong></td><td><strong>74.8</strong></td><td><strong>51.0</strong></td><td><strong>0.801</strong></td></tr>
</tbody>
</table>
</div>
<figcaption class="tw-text-base tw-text-[var(--fg-muted)] tw-mt-4 tw-italic tw-inline-block tw-text-left">Main results of PrompTo, averaged over the 13 directions across three kinds of evaluators. Fool rate and its Style Gap Recovered (SGR) are averaged across three LLM discriminators; AV ratio is the AV classifier's same-model rate; Cos. sim. is the STAR embedding cosine similarity between the text and centroids. Higher is better throughout.</figcaption>
</figure>

## Model Signatures

*PrompTo*'s style prompts discover Gemma as an enthusiastic tutor, because it uses warm openings and asks follow-up questions; Qwen as a neutral assistant, because it goes directly to the question and does nothing else; and Haiku as a knowledgeable friend, because it gets straight to the answer with warm voice but no AI-like phrases. *PrompTo* finds the most distinctive features of each model, and we measure their frequency with regex.

![Stylistic features of target models. Frequencies counted with regex.](style-features.png)

## Style Prompt Generalization {data-toc=Generalization}

Style prompts optimized for one source model transfer to other source models with **78%** of the SGR retained on average. This indicates that style prompts mainly describe the target's style rather than suppress the traits of the source model they were optimized with.

![Style prompts transfer across source models. Each row is a source model executing a style prompt and each column is the source model the prompt was optimized for. Boxed diagonal cells are each model running its own prompt.](transfer-heatmap.png)

## Feature Frequency Mismatch {data-toc=Limitations}

A model's behavior can be seen as a distribution of phrases, but the restyled text collapses it into just one behavior. The style prompt provides a list of openers, but the source model picks one of them almost every time. Because the discriminator only sees one triplet at a time, it cannot see the frequency mismatch.

![Feature frequency for target model vs. source model with π*. The original target model writes in a more diverse way, but the source model with π* fails to replicate that diversity.](style-choice.png)
