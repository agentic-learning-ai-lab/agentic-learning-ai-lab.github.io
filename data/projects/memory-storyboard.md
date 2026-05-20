---
affiliations:
  - { name: 'Yanlai Yang', aff: 'New York University' }
  - { name: 'Mengye Ren',  aff: 'New York University' }
links:
  code: https://github.com/agentic-learning-ai-lab/memory-storyboard
  poster: /assets/projects/memory-storyboard/poster.pdf
bibtex: |
  @inproceedings{yang2025memorystoryboard,
    title     = {Memory Storyboard: Leveraging Temporal Segmentation for Streaming Self-Supervised Learning from Egocentric Videos},
    author    = {Yang, Yanlai and Ren, Mengye},
    booktitle = {Conference on Lifelong Learning Agents (CoLLAs)},
    year      = {2025}
  }
---

## The Memory Storyboard Framework {data-toc=Framework}

![Our proposed Memory Storyboard framework for streaming SSL from egocentric videos. Similar frames are clustered into temporal segments and their labels (text information for illustration purpose only) are updated in the long-term memory buffer for replay. SSL involves contrastive learning at both the frame and temporal segment levels.](main_v2.png){width=800}

## Two-tier Memory Structure {data-toc="Two-Tier Memory"}

Long-term memory is updated with reservoir sampling, and short-term memory with first-in-first-out (FIFO). Temporal segmentation is applied on the short-term memory, which then updates the labels of corresponding images in the long-term memory.

![](detail_v2.png){width=800}

## Temporal Segmentation Algorithm {data-toc=Segmentation}

The optimization objective of our segmentation algorithm is to maximize the average within-class similarity using a greedy algorithm.

![Visualization of the temporal segments produced by Memory Storyboard on (a) SAYCam (b)(c) KrishnaCam at the end of training. The images are sampled at 10 seconds per frame. Each color bar corresponds to a temporal class (the first and the last class might be incomplete).](seg_vis.png){width=800}

## Results

We demonstrate that Memory Storyboard achieves state-of-the-art performance on downstream ImageNet and iNaturalist classification tasks when trained on real-world egocentric video datasets. Among all the streaming self-supervised learning methods we evaluated, Memory Storyboard is the only one that is competitive with or even outperforms IID training when trained on these datasets.

![Results on streaming SSL from SAYCam. Downstream evaluation on object classification (Accuracy %) for SSL models trained under the streaming setting. For "No Replay" and "IID" the results are the same for different memory buffer sizes. The "IID" methods are not under the streaming setting and are for reference only as a performance "upper bound" with the same number of gradient updates. Unless specified, standard reservoir sampling is used in the replay buffer.](results.png){width=800}

## Batch Composition Under Different Memory Constraints {data-toc="Batch Composition"}

We study the effects of training factors including label merging, subsampling rate, average segment length, memory buffer size, and training batch composition. These studies provide insight for more efficient streaming learning from videos. In particular, we explore the optimal composition ratio of the training batch from short-term vs. long-term memory, under different memory constraints. Larger batches from long-term memory improve performance when we can afford a large memory bank, while smaller batches can help prevent overfitting when we have a small memory bank.

![Memory Storyboard performance on SAYCam with different long-term memory sizes (5k, 10k, 50k, and 100k) and varying training batch compositions (12.5% to 75.0% from short-term memory) using SVM readout. Each colored line represents the performance of different training batch compositions when the model has seen the same amount of data from the stream. Each black line represents the performance of different training batch compositions when the model has taken the same number of gradient updates.](batch_buffer.png){width=800}

## Conclusion

The ability to continuously learn from large-scale uncurated streaming video data is crucial for applying self-supervised learning methods in real-world embodied agents. Existing works have limited exploration on this problem, have mainly focused on static datasets, and do not perform well in the streaming video setting. Inspired by the event segmentation mechanism in human cognition, we propose Memory Storyboard, which leverages temporal segmentation to produce a two-tier memory hierarchy akin to the short-term and long-term memory of humans. Memory Storyboard combines a temporal contrastive objective and a standard self-supervised contrastive objective to facilitate representation learning from scratch through streaming video experiences. Memory Storyboard achieves state-of-the-art performance on downstream classification and object detection tasks when trained on real-world large egocentric video datasets. By studying the effects of subsampling rates, average segment length, normalization, and optimal batch composition under different compute and memory constraints, we also offer valuable insights on the design choices for streaming self-supervised learning.
