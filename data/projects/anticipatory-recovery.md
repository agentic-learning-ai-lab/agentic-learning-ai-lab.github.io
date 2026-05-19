---
affiliations:
  - { name: 'Yanlai Yang',        aff: 'New York University' }
  - { name: 'Matt Jones',         aff: 'University of Colorado, Boulder', url: 'https://www.colorado.edu/cognitive-psychology/matt-jones/' }
  - { name: 'Michael C. Mozer',   aff: ['Google DeepMind', 'University of Colorado, Boulder'], url: 'https://home.cs.colorado.edu/~mozer/' }
  - { name: 'Mengye Ren',         aff: 'New York University' }
links:
  code: https://github.com/agentic-learning-ai-lab/anticipatory-recovery
  poster: /assets/projects/anticipatory-recovery/poster.png
bibtex: |
  @inproceedings{yang2024reawakening,
    title     = {Reawakening Knowledge: Anticipatory Recovery from Catastrophic Interference via Structured Training},
    author    = {Yang, Yanlai and Jones, Matt and Mozer, Michael C. and Ren, Mengye},
    booktitle = {Advances in Neural Information Processing Systems},
    year      = {2024},
  }
---

## The Anticipatory Recovery Phenomenon {data-toc=Phenomenon}

We uncover a very intriguing behavior when fine-tuning an LLM on *N* documents for *E* epochs with cyclic training, taking multiple gradient steps on each document each pass: starting from epoch 2, the loss on the first task stops increasing halfway through the cycle and starts to recover. In later epochs, more than 90% of the initial forgetting has been recovered before we cycle back to the first task. We call this surprising effect **"anticipatory recovery."**

![Cross Entropy Loss curves on the first document for cyclic and random shuffled fine-tuning. The black circles indicate points just prior to training on the focal document.](01a_loss1.png){width=400}

## Motivation

Most works in continual learning have focused on several very limited and artificial settings, such as task or class incremental learning. In these paradigms, the tasks are often completely disjoint with each other, and the old tasks do not appear again. This is very different from naturalistic data sequences that occur in the real world, which have repetition and temporal structure.

In this paper, we study the simplest special case of sequential learning with temporal structure, cyclic training. In cyclic training, the tasks are iterated in the exact same order across different epochs. In our experiments, each task is training a large language model on a different document. In particular, we take a few gradient steps on each document before moving to the next one.

![](cyclic_training.png){width=800}

## Understanding Anticipatory Recovery {data-toc=Understanding}

We did a comprehensive analysis on how different training factors affect anticipatory recovery. We found that anticipatory recovery occurs only when the network has sufficient width and depth such that it is well fitted to each document.

Namely, longer task sequences and more gradient steps on each task can facilitate the amount of recovery.

![Effect of model size for pre-trained models on anticipatory recovery. "Recovery Score" refers to the average proportion of the initial forgetting during the last epoch that the model recovers before returning to the same document.](modelsize.png){width=500}

![Effect of model size for models trained from scratch on anticipatory recovery.](modelsizescratch.png){width=500}

![Effect of number of documents (sequence length) for models trained from scratch on anticipatory recovery.](numtasks.png){width=500}

![Effect of number of gradient steps for models trained from scratch on anticipatory recovery.](numgradstep.png){width=500}

## Visualizations

We made some initial progress towards understanding the underlying mechanisms that cause the anticipatory recovery phenomenon. We visualized how the model weights and activations change throughout cyclic training, and find that the trajectory forms a conic spiral in a low-dimensional manifold, and that the solutions to adjacent tasks become closer.

![Top 3 PCA components of last layer weights in the first 3 epochs.](spiral.png){width=400}

## Prequential Evaluation {data-toc="Prequential Eval"}

Prequential evaluation refers to measuring the online loss, or the loss on the upcoming task, which matters the most for real-world agents.

As a result of anticipatory recovery, we show that training with fixed ordering achieves superior performance than random shuffling in the prequential evaluation setting. This result hints at the practical benefits of structured training.

![](prequential.png){width=400}

## Toy Computation Model {data-toc="Toy Model"}

We devise a computation toy model that demonstrates a similar anticipatory recovery phenomenon in its loss curve, with a single learnable linear embedding layer and a learnable target vector with task-specific mappings. Please refer to the paper for more details.

## Conclusion

We demonstrated the anticipatory recovery phenomenon — networks recover from the initial forgetting before seeing the same document again. This phenomenon is a sharp contrast with the well-known phenomenon of catastrophic interference, where forgetting increases monotonically as a network is trained on a sequence of different documents. Our research indicates that there is value in exploring naturalistic task sequences within continual learning.
