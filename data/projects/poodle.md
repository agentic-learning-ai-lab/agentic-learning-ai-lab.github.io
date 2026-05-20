---
affiliations:
  - { name: 'Alex N. Wang', aff: 'New York University' }
  - { name: 'Chris Hoang',  aff: 'New York University' }
  - { name: 'Yuwen Xiong', url: 'https://www.cs.toronto.edu/~yuwen/' }
  - { name: 'Yann LeCun',   aff: 'New York University', url: 'http://yann.lecun.com/' }
  - { name: 'Mengye Ren',   aff: 'New York University' }
links:
  code: https://github.com/Agentic-Learning-AI-Lab/poodle
bibtex: |
  @inproceedings{wang2025poodle,
    title     = {PooDLe: Pooled and Dense Self-Supervised Learning from Naturalistic Videos},
    author    = {Wang, Alex N. and Hoang, Chris and Xiong, Yuwen and LeCun, Yann and Ren, Mengye},
    booktitle = {International Conference on Learning Representations (ICLR)},
    year      = {2025}
  }
---

## Problem: current SSL methods rely on iconic data assumptions {data-toc=Problem}

![Iconic image from ImageNet](imagenet-image.jpeg){width=400}

![Scene image from BDD100K driving video](bdd-image.png){width=400}

Self-supervised learning (SSL) is able to learn visual representations without manual labels, enabling the use of large-scale internet data such as naturalistic video for training. However, many SSL methods still revolve around the ImageNet dataset, which consists of iconic images with a single central subject and a balanced class distribution. In contrast, naturalistic videos often contain scenes with multiple objects, imbalanced class distributions, and varying object scales, making them ill-suited for iconic SSL methods.

![Semantic segmentation map for multi-object scene from BDD100K](bdd-semseg.png){width=400}

![Crucial foreground objects only represent a small proportion of pixels](class-distribution-colored.png){width=400}

Iconic SSL methods learn pooled features from large crops of an image, which may not be effective for multi-object scenes where each crop may contain different objects. Recently proposed dense SSL objectives differentiate between different objects by learning 2D feature maps which maintain spatial information. Nevertheless, dense SSL can suffer from spatial region imbalance, where the model is incentivized to focus on the background rather than smaller foreground objects. To bootstrap learning of foreground objects, current methods for naturalistic video still rely on globally-pooled iconic objectives or iconic datasets.

## Method: Pooled and Dense Learning from naturalistic videos {data-toc=Method}

![Overview of PooDLe. Green path: dense objective applied to 2D feature maps of full paired frames outputted by spatial decoder. Orange path: pooled objective applied to pooled features of flow-aware subcrops outputted by encoder.](method.png){width=900}

We propose PooDLe, a SSL method that combines a dense flow equivariance objective and a pooled invariance objective. The dense objective captures spatial information by learning features that are equivariant to flow, or the motion between frames, at the scene level. Conversely, the pooled objective learns high-level object semantics from small subcrops, which act as *pseudo-iconic* data. The two objectives are unified within a single architecture that uses a lightweight spatial decoder to upsample high-level features into fine-grained feature maps.

![Probability of random subcrop covering ≥ 10% of an object versus pixel-level probability for varying object sizes. Graph data generated using simulation in toy and empirical settings.](subcrop.png){width=800}

We hypothesize that using small subcrops can mitigate spatial region imbalance because the percentage of subcrops that have sufficient coverage of small objects will be significantly higher than the percentage of pixels that containing those objects. We believe that the threshold for sufficient coverage can be relatively small because foreground objects have higher information content compared to repetitive background textures, and thus, their information is preserved in pooled representations. The graph above shows that the relative difference in subcrop hit probability to pixel probability is greater for smaller objects and tapers off for larger objects.

![Naive: place both objectives at last encoder layer.](top-only-decoder.png){width=400}

![PooDLe: pooled objective on last encoder layer; dense objective on high-resolution output from spatial decoder.](top-down-decoder.png){width=400}

How do we combine the pooled and dense objectives within a single architecture? Our intuition is that the pooled objective should operate on high-level semantic features while the dense objective should operate on high-resolution features that preserves small objects and fine details. This leads us to introduce a lightweight spatial decoder that leverages skip connections to earlier layers to upsample features from the last encoder layer into high-resolution feature maps. We believe the last encoder layer serves as an information bottleneck, as the features need to capture high-level object invariance for the pooled objective, but must also preserve spatial information for the spatial decoder and dense objective.

## Results: semantic segmentation and object detection {data-toc=Results}

<figure class="tw-text-center tw-my-10">
  <div class="tw-mx-auto" style="max-width: 800px;">
    <video autoplay muted loop playsinline preload="metadata" style="width: 100%; height: auto; border-radius: 0.25rem;">
      <source src="/assets/projects/poodle/semseg-comparison.mp4" type="video/mp4">
    </video>
    <figcaption class="tw-text-base tw-text-gray-600 tw-mt-4 tw-italic tw-inline-block tw-text-left">Comparison of methods on semantic segmentation linear readout.</figcaption>
  </div>
</figure>

![BDD100K semantic segmentation and object detection and Cityscapes semantic segmentation results using either lightweight or heavier readout headers. *Pretrained on BDD, initialized with supervised IN1K weights.](bdd-results-table.png){width=800}

PooDLe outperforms all BDD-pretrained baselines by a significant margin on in-distribution BDD semantic segmentation and object detection and transfer to Cityscapes semantic segmentation. PooDLe also surpasses ImageNet (IN1K) supervised pretraining despite the latter's advantages in having a class-balanced dataset with iconic views of objects. In addition, we may pretrain PooDLe on BDD with weights initialized from the IN1K supervised checkpoint to further improve performance. In the video, the IN1K supervised baseline generates noisy segmentation boundaries and the FlowE baseline struggles with small objects such as traffic lights while PooDLe gives cleaner boundaries and picks up more small objects.

![ADE20K semantic segmentation results using either linear readout or UperNet finetuning.](wt-results-table.png)

We also experiment with pretraining on the recent [WalkingTours](https://huggingface.co/datasets/shawshankvkt/Walking_Tours) (WT) dataset, a first-person video dataset. PooDLe outperforms all WT-pretrained baselines and is competitive with IN1K-pretrained DINO when pretrained on WT<sub>all</sub>.

![BDD100K semantic segmentation linear readout results with classes grouped by average pixel size (small vs. large) or occurrence frequency (rare vs. common).](grouping-results-table.png)

PooDLe improves over FlowE, a dense SSL method, on small classes while maintaining strong performance on large classes, suggesting that PooDLe is able to learn better representations across object scales. Conversely, PooDLe improves over IN1K supervised pretraining on large and common classes. When initialized from IN1K supervised weights, PooDLe is able to retain the strong performance on small and rare classes that likely stems from the class balanced distribution of IN1K.

## Conclusion: further exploration of learning from naturalistic video {data-toc=Conclusion}

We have proposed PooDLe, a SSL method that combines pooled invariance and dense flow equivariance objectives to learn visual representations from naturalistic videos. We hope that this work will motivate further exploration on how to leverage naturalistic visual data for training next-generation vision models.
