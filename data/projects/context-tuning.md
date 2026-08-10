---
mathjax: true
affiliations:
  - { name: 'Jack Lu',       aff: 'New York University' }
  - { name: 'Ryan Teehan',   aff: 'New York University' }
  - { name: 'Zhenbang Yang', aff: 'New York University' }
  - { name: 'Mengye Ren',    aff: 'New York University' }
italic_terms:
  - Context Tuning
  - CT-KV
links:
  code: https://github.com/agentic-learning-ai-lab/context-tuning
bibtex: |
  @inproceedings{lu2026contexttuning,
    title     = {Context Tuning for In-Context Optimization},
    author    = {Lu, Jack and Teehan, Ryan and Yang, Zhenbang and Ren, Mengye},
    booktitle = {International Conference on Machine Learning (ICML)},
    year      = {2026}
  }
---

## Overview

*CT-KV* is our strongest variant of *Context Tuning*:

<ul style="list-style: disc; padding-left: 1.5rem; margin-bottom: 1rem;">
  <li style="margin-bottom: 0.5rem;"><strong>Compared with in-context learning (ICL),</strong> <em>CT-KV</em> refines the model's initial memory representation of the provided input-output examples instead of using it directly for prediction, substantially improving accuracy.</li>
  <li style="margin-bottom: 0.5rem;"><strong>Compared with Test-Time Training (TTT),</strong> <em>CT-KV</em> achieves competitive accuracy without updating model weights and in half the training time or less.</li>
  <li><strong>Combined with TTT,</strong> <em>CT-KV</em> achieves the highest accuracy, showing that KV cache tuning and model weight updates are complementary.</li>
</ul>

![Accuracy vs. training time, averaged over 26 NLP tasks.](overview.png){width=640}

## Context Tuning for In-Context Optimization {data-toc=Method}

*CT-KV* keeps the LLM frozen and turns the key-value (KV) cache formed from the provided examples into a trainable memory representation. During optimization, **Leave-One-Out Masking** asks the model to predict each output from the other examples, while **Token Dropout** improves generalization. At inference, the model conditions on the full optimized cache. Our paper also presents *CT-Prompt*, a prompt embedding variant.

![CT-KV initializes a key-value prefix from the provided examples and optimizes it with Leave-One-Out Masking (left). At generation time, the model conditions on the full optimized prefix to answer a new query (right).](method.png){width=1000}

## Experiments {data-toc=Results}

We evaluate *Context Tuning* on [NLP-LR](https://arxiv.org/abs/2110.15943), [MMLU](https://arxiv.org/abs/2009.03300), [BBH](https://arxiv.org/abs/2206.04615), and [ARC](https://arxiv.org/abs/1911.01547). The experiments span pretrained LLMs from 1B to 32B parameters.

![Representative test examples from BBH, NLP-LR, and MMLU, followed by three input-output examples and a test example from ARC.](benchmarks.png){width=1000}

### Comparing Context Tuning to Baselines

*CT-KV* outperforms [in-context learning](https://arxiv.org/abs/2005.14165) (ICL), [Prompt Tuning](https://arxiv.org/abs/2104.08691), [Prefix Tuning](https://arxiv.org/abs/2101.00190), [LoRA](https://arxiv.org/abs/2106.09685), [rank-stabilized LoRA](https://arxiv.org/abs/2312.03732), and [DoRA](https://arxiv.org/abs/2402.09353) across all four benchmarks. It achieves competitive accuracy with TTT without updating model weights and in half the training time or less, while TTT+*CT-KV* achieves the best accuracy on every benchmark. On NLP-LR, *CT-KV*'s single-task adaptation surpasses [MetaICL's](https://arxiv.org/abs/2110.15943) multi-task meta-training under matched samples (44.2% vs. 43.3%).

![Accuracy and training time per task in seconds. Means and standard deviations are computed over five sets of examples, except ARC, which has a fixed set. Bold and underlined values mark the best and second-best accuracy for each benchmark.](main-results.png){width=1000}

## Robustness to Example Count and Quality {data-toc=Robustness}

(a) *CT-KV* remains ahead of ICL and Prefix Tuning as more examples are provided.

(b) *CT-KV* performs best on both benchmarks even when up to 75% of example labels are corrupted.

![NLP-LR and MMLU accuracy versus (a) the number of examples and (b) the label corruption probability.](robustness.png){width=1000}

## Scaling Up the Pretrained Models {data-toc=Scaling}

Across five pretrained models ranging from 12B to 32B parameters and spanning multiple architectures, *CT-KV* outperforms ICL and Prefix Tuning.

![BBH accuracy across pretrained models of increasing size.](scaling-results.png){width=1000}

## Ablating Our Design Choices {data-toc=Ablations}

**Leave-One-Out Masking** and **Token Dropout** both improve *CT-KV* on three of the four benchmarks.

![Ablations of Leave-One-Out Masking and Token Dropout across four benchmarks. Means and standard deviations are computed over five sets of examples, except ARC, which has a fixed set.](ablation-results.png){width=667}

## Qualitative Results {data-toc=Qualitative}

We show how *CT-KV* predictions evolve during optimization on two ARC tasks. Iteration 0 is equivalent to ICL. Green labels indicate correct predictions, and red labels indicate incorrect predictions.

### Color Mapping

At iteration 0, the model fills the interior of every bordered square with yellow. During optimization, it gradually discovers the correct fill color for each one.

![ARC color-mapping task with four input-output examples, the test input, and predictions across CT-KV training iterations.](qualitative-color-mapping.png){width=1000}

### Cross Completion

At iteration 0, the model already identifies that red should be used to complete the cross shapes, but does not understand that it should avoid overwriting black squares. By iteration 200, the prediction becomes more consistent with the provided examples and solves the task.

![ARC cross-completion task with four input-output examples, the test input, and predictions across CT-KV training iterations.](qualitative-cross-completion.png){width=1000}
