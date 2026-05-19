---
affiliations:
  - { name: 'Ying Wang',            aff: 'New York University' }
  - { name: 'Mengye Ren',           aff: 'New York University' }
  - { name: 'Andrew Gordon Wilson', aff: 'New York University', url: 'https://cims.nyu.edu/~andrewgw/' }
links:
  code: https://github.com/Agentic-Learning-AI-Lab/icc
bibtex: |
  @misc{wang2025icc,
    title         = {In-Context Clustering with Large Language Models},
    author        = {Wang, Ying and Ren, Mengye and Wilson, Andrew Gordon},
    year          = {2025},
    eprint        = {2510.08466},
    archivePrefix = {arXiv},
    primaryClass  = {cs.LG}
  }
---

## Overview

Different from previous in-context supervised learning that requires multiple input-output pairs in the prompt, ICC extends in-context learning to an unsupervised setting where only unlabeled input data appears in the context.

![](icc.jpeg){width=800}

## Zero-shot ICC {data-toc=Zero-shot}

**LLMs pre-trained on large text corpora are capable of zero-shot clustering.** The figure below shows zero-shot clustering accuracy of various pretrained LLMs on t-Distribution with different degrees of freedom (df). When df is small, the data distribution has a heavy tail, which violates the Gaussian assumption of k-means. LLMs (especially those with larger model sizes) show impressive zero-shot clustering capabilities on heavy-tailed data.

![Figure 1: Zero-shot clustering accuracy.](numeric_zeroshot.jpeg){width=800}

To better understand the inner mechanism of ICC, we visualize the attention scores across different transformer layers. We observe that **attention matrices in intermediate layers show block structures that align with cluster identities**. Spectral clustering using attention scores yields competitive performance compared to direct LLM generation. This surprising result suggests that attention of LLMs already encodes rich structural information beyond what is directly generated. Please refer to Section 3.2 in our paper for more details.

![Figure 2: Visualization of attention allocation on input data and corresponding cluster labels. The x-axis and y-axis are the ground-truth cluster labels. The top right curves are the average accuracy of spectral clustering using the input-input attention score matrices (top-left) across different layers, compared with the average accuracy of LLM generation.](attention.jpeg){width=800}

## Improve ICC through Finetuning {data-toc=Finetuning}

While pretrained LLMs show promising zero-shot clustering capabilities, small open-source models lag behind classical methods and proprietary LLMs. We create synthetic clustering data and use simple LoRA fine-tuning with NTP loss to further improve ICC.

![Figure 3: Effect of finetuning.](numeric_finetune.jpeg){width=800}

We also extend ICC to multimodal LLMs. By projecting image embeddings obtained from a pretrained visual encoder to language embedding space, LLMs can learn to produce meaningful groupings of images based on their semantic meaning.

![Figure 4: Left: Multimodal LLM architecture with average pooling for image features. Right: Qualitative comparison of models on image clustering — ICC outperforms k-means when the data has rich semantic information.](image_clustering.jpeg){width=800}

## Text-Conditioned Clustering {data-toc="Text-Conditioned"}

Real-world data can have multiple plausible clusterings depending on the objective. For example, the same set of animal images can be clustered by visual properties like colors (orange vs. white) or semantic categories like species (dog vs. cat). When the clustering condition changes, classical methods typically require retraining or re-engineering features. In contrast, **LLMs can easily adapt to new conditions through prompting thanks to their powerful contextual understanding capability**.

![Figure 5: Clustering changes when the condition changes.](condcluster.jpeg){width=800}
