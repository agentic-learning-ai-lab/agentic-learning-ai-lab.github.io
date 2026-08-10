---
affiliations:
  - { name: 'Jack Lu',     aff: 'New York University' }
  - { name: 'Ryan Teehan', aff: 'New York University' }
  - { name: 'Mengye Ren',  aff: 'New York University' }
links:
  code: https://github.com/Agentic-Learning-AI-Lab/procreate-diffusion-public
bibtex: |
  @inproceedings{lu2024procreate,
    title     = {ProCreate, Don't Reproduce! Propulsive Energy Diffusion for Creative Generation},
    author    = {Lu, Jack and Teehan, Ryan and Ren, Mengye},
    booktitle = {European Conference on Computer Vision (ECCV)},
    year      = {2024}
  }
---

## Overview

![After fine-tuning diffusion models on categories of our few-shot dataset FSCG-8, ProCreate can significantly improve the diversity and creativity of generations while retaining high image quality and prompt fidelity.](teaser_figure.png){width=900}

## Our Method {data-toc=Method}

At each denoising step of a pre-trained diffusion model, ProCreate applies propulsive guidance that maximizes the distances between the generated clean image and the reference images.

![](main_v5.png){width=1000}

## Application 1: Few-Shot Creative Generation {data-toc="Few-Shot Generation"}

We collect dataset FSCG-8, fine-tune a Stable Diffusion checkpoint on each category of image-caption pairs, and compare the samples generated from [DDIM](https://arxiv.org/abs/2010.02502), [CADS](https://arxiv.org/abs/2310.17347), and ProCreate.

### Our Dataset: Few-Shot Creative Generation 8

We curate a dataset that contains 8 categories with 50 image-caption pairs in each. Each category contains images that share properties like style, texture, and shape.

![](datasets_figure_cropped.png){width=1000}

### Results

We show the qualitative comparison between [DDIM](https://arxiv.org/abs/2010.02502), [CADS](https://arxiv.org/abs/2310.17347), and ProCreate for few-shot creative generation on FSCG-8 with standard fine-tuning. For each sampling method, we show two prompts and four generated samples for each prompt. We also match each ProCreate sample with its most similar training image.

![](train10_qualitative_updated.png){width=1000}

## Application 2: Training Data Replication Prevention {data-toc="Replication Prevention"}

[Recent studies](https://arxiv.org/abs/2212.03860) show that large-scale models like Stable Diffusion are prone to replicating their training data, raising privacy and copyright concerns. We sample from Stable Diffusion with [LAION](https://arxiv.org/abs/2210.08402) captions and show that using ProCreate to guide samples away from the [LAION](https://arxiv.org/abs/2210.08402) images significantly reduces replication.

![](laion12m_replication_final.png){width=1000}

## Video Presentation {data-toc=Video}

![](procreate.mp4 "controls"){width=720}

## Broader Impact {data-toc=Impact}

This research presents significant broader impacts. It offers content creators and designers the tools to enhance AI-assisted design with a smaller risk of replicating reference images, or private/copyrighted training images. Although the primary implications are beneficial, there exists a potential for this technology to facilitate the design of counterfeit products. Addressing the ethical use and regulatory oversight of such advancements warrants further discussion in future works.
