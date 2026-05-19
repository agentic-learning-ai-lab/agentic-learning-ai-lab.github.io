---
mathjax: true
affiliations:
  - { name: 'Jack Lu',       aff: 'New York University' }
  - { name: 'Ryan Teehan',   aff: 'New York University' }
  - { name: 'Zhenbang Yang', aff: 'New York University' }
  - { name: 'Mengye Ren',    aff: 'New York University' }
links:
  code: https://github.com/Agentic-Learning-AI-Lab/context-tuning
bibtex: |
  @misc{lu2025contexttuning,
    title         = {Context Tuning for In-Context Optimization},
    author        = {Lu, Jack and Teehan, Ryan and Yang, Zhenbang and Ren, Mengye},
    year          = {2025},
    eprint        = {2507.04221},
    archivePrefix = {arXiv},
    primaryClass  = {cs.CL}
  }
---

## Overview

![Comparison of training-free methods, prompt adaptation techniques, and methods from our proposed In-Context Optimization framework (Test-Time Training, CT-Prompt, CT-KV) on solving tasks from a split of UnifiedQA and CrossFit. Dots are baselines, stars are our methods, bolded methods attain the best performance-efficiency tradeoff.](scatter.png){width=500}

## Our Method {data-toc=Method}

We illustrate the *CT-KV* variant of *Context Tuning*. Our [paper](https://arxiv.org/pdf/2507.04221) also contains details on the *CT-Prompt* variant.

- *Context Tuning* (left) first initializes a prefix $\{K_i, V_i\}_{i=1}^k$ from demonstration pairs $\{(x_i, y_i)\}_{i=1}^k$, then trains it to solve each pair. To prevent the model from simply retrieving the demonstration pair from the prefix, Leave-One-Out Masking prevents the model from attending to $K_i, V_i$ when solving pair $i$. No model weight updates are required!
- Generation (right) conditions on all optimized prefixes $\{K_i^*, V_i^*\}_{i=1}^k$ to solve the query $x_q$.

![](mainfigure.png){width=1000}

## Qualitative Samples {data-toc=Qualitative}

We select sample tasks from [ARC](https://arxiv.org/pdf/1911.01547) to illustrate how the generated answers gradually improve with *CT-KV* training. For each of the two ARC tasks at the top and bottom, we display 4 demonstration query-answer pairs, the test query, and model predictions at *CT-KV* training iterations 0, 50, 100, 150, 200. Correct predictions are color-coded in green and incorrect predictions in red.

- **Top task:** the model's prediction at iteration 0 (equivalent to [In-Context Learning](https://arxiv.org/pdf/2005.14165)) shows a strong bias toward filling orange-border squares with yellow. As *CT-KV* training progresses, the model gradually learns to fill each orange-border square with the correct color.
- **Bottom task:** the model first learns that only grey grid cells can turn red, and then correctly completes the cross shapes.

![](supp_arc.png){width=1000}

## Quantitative Evaluation {data-toc=Evaluation}

We evaluate *Context Tuning* against training-free, prompt-based adaptation, and [Test-Time Training](https://arxiv.org/pdf/2411.07279) methods on a diverse set of challenging datasets with [GPT-2](https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf) and [Llama 3 models](https://arxiv.org/pdf/2407.21783).

### Benchmarks

We show a test pair from [BBH](https://arxiv.org/pdf/2206.04615), [NLP-LR](https://arxiv.org/pdf/2110.15943), and [MMLU](https://arxiv.org/pdf/2009.03300) each, and 3 demonstration pairs followed by a test pair from [ARC](https://arxiv.org/pdf/1911.01547).

![](dataset.png){width=1000}

### Results

Based on our quantitative comparison of *Context Tuning* and baselines, we find that the *CT-KV* variant of *Context Tuning* significantly outperforms Zero-Shot Prompting, [In-Context Learning](https://arxiv.org/pdf/2005.14165), [Prompt Tuning](https://arxiv.org/pdf/2104.08691), and [Prefix Tuning](https://arxiv.org/pdf/2101.00190). *CT-KV* is also competitive with the more computationally intensive [Test-Time Training](https://arxiv.org/pdf/2411.07279) approach. Finally, we show that *CT-KV* can serve as a post-hoc refinement step following [Test-Time Training](https://arxiv.org/pdf/2411.07279), leading to improved few-shot adaptation performance compared to either method used in isolation.

![](table.png){width=1000}
