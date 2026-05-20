---
affiliations:
  - { name: 'Ryan Teehan',  aff: 'New York University' }
  - { name: 'Brenden Lake', aff: 'New York University', url: 'https://cims.nyu.edu/~brenden/' }
  - { name: 'Mengye Ren',   aff: 'New York University' }
links:
  code: https://github.com/Agentic-Learning-AI-Lab/new-token-learning
bibtex: |
  @inproceedings{teehan2024college,
    title     = {{CoLLEGe}: Concept Embedding Generation for Large Language Models},
    author    = {Ryan Teehan and Brenden Lake and Mengye Ren},
    booktitle = {Conference on Language Modeling (COLM)},
    year      = {2024}
  }
---

## Building Machines that Learn Concepts Quickly {data-toc=Motivation}

Imagine a student first attending a philosophy lecture on epistemology, wherein their professor discusses and critiques various philosophical positions and uses unfamiliar terms for newly-encountered concepts. After only a few examples, the student can quickly build an intuition about these new concepts and consolidate this knowledge.

In this way, humans can quickly infer the meaning of new words, even having only heard them used a few times, in settings like the philosophy lecture above or when encountering slang terms on social media, but LLMs fail at doing the same.

While humans can quickly abstract from a few examples to consolidate new knowledge, LLMs attempt to directly find and re-use information in the available context.

We:

- Develop a simple add-on learnable module for few-shot, LLM concept learning, which transfers to diverse tasks with **no additional finetuning**.
- Build a few-shot concept learning dataset from a large pretraining dataset (The Pile).
- Present three challenging datasets for new concept learning, CoLLEGe-GRE, CoLLEGe-DefGen, and CoLLEGe-Slang, used to measure the effectiveness of few-shot concept learning methods for LLMs. These datasets test both general and complex concept knowledge, naturalistic acquisition of new concepts, and relational abstraction.

### Method

![We design a few-shot learning method which generates a new concept embedding using support sequences containing a new concept token. This embedding is optimized to allow a frozen pretrained LLM to model a query sequence containing the same new token.](colm_paper_arch.svg){width=800}

## Task-General Training for Zero-Shot Transfer {data-toc=Training}

We select words to mask with new tokens based on frequency and construct few-shot support and query sequences from a large pretraining dataset, The Pile.

Training mimics pretraining, allowing transfer to diverse tasks zero-shot, with **no additional finetuning** to transfer to our tasks.

We train by minimizing **cross entropy losses** on positive and negative examples as well as **distilling from the base LLM**.

![We optimize using a combination of cross-entropy losses and distillation losses.](college_losses.png){width=800}

![Our dataset consists of few-shot support and query sequences adapted from the Books3, Books2, and Pile-CC subsets of The Pile.](college_data.png){width=800}

## With CoLLEGe we can… {data-toc=Applications}

### Solve GRE Problems

![](few_shot_gre.png)

### Identify Twitter Slang

![](twitter_college.png)

### Define New Concepts

![](college_willies.png)

![](college_mushroom.png)

## Conclusion & Future Work {data-toc=Conclusion}

CoLLEGe can learn general purpose embeddings for new concepts which outperform In-Context Learning on all tasks without additional finetuning. Using task-general training, CoLLEGe can solve GRE problems involving new concepts, identify unknown slang terms, and generate definitions with only a few examples.

This opens the door for future work focusing on **online continual concept acquisition**, which consists of incrementally identifying and compressing concepts from a stream of experience.
