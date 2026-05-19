---
carousel: true
affiliations:
  - { name: 'Ying Wang',   aff: 'New York University' }
  - { name: 'Yanlai Yang', aff: 'New York University' }
  - { name: 'Mengye Ren',  aff: 'New York University' }
links:
  code: https://github.com/Agentic-Learning-AI-Lab/lifelong-memory
bibtex: |
  @misc{wang2024lifelongmemory,
    title         = {LifelongMemory: Leveraging LLMs for Answering Queries in Long-form Egocentric Videos},
    author        = {Ying Wang and Yanlai Yang and Mengye Ren},
    year          = {2024},
    eprint        = {2312.05269},
    archivePrefix = {arXiv},
    primaryClass  = {cs.CV}
  }
---

## Pipeline

LifelongMemory takes a long egocentric video and a natural-language query, then answers the query through a three-stage pipeline.

![Pipeline overview.](pipeline.png){width=800}

### Stage 1: Video Captioning

A multi-modal LLM (MLLM) produces captions from a list of short video clips. Content and query similarity filters are then applied to remove redundant and irrelevant captions.

<figure class="tw-text-center tw-my-10">
  <video autoplay muted loop controls playsinline style="max-width: 700px; width: 100%; height: auto; margin: 0 auto; border-radius: 0.25rem;">
    <source src="/assets/projects/lifelong-memory/stageone.mp4" type="video/mp4">
  </video>
</figure>

### Stage 2: LLM Reasoning

An LLM is instructed to take inputs from the list of condensed captions and retrieve the most relevant interval candidates.

![](stagetwo.png){width=700}

### Stage 3: Output Refinement

For video QA, ensemble the predictions of multiple runs using **vote by confidence**.

![](votebyconfidence.png){width=700}

For NLQ, feed candidate intervals predicted by our previous stage into a pretrained NLQ model to obtain a fine-grained prediction.

<figure class="tw-text-center tw-my-10">
  <video autoplay muted loop controls playsinline style="max-width: 700px; width: 100%; height: auto; margin: 0 auto; border-radius: 0.25rem;">
    <source src="/assets/projects/lifelong-memory/stagethree.mp4" type="video/mp4">
  </video>
</figure>

## Visualization

We visualize the raw predictions of the LLM below. The LLM generates high-quality results without any post-processing.

<div class="project-carousel lm-carousel">
  <div class="item">
    <video muted loop playsinline controls preload="metadata" width="600">
      <source src="/assets/projects/lifelong-memory/open_fridge.mp4" type="video/mp4">
    </video>
    <p><strong>Query:</strong> What time did I open the fridge?<br><strong>LLM:</strong> C opens the fridge at 480–540.</p>
  </div>
  <div class="item">
    <video muted loop playsinline controls preload="metadata" width="600">
      <source src="/assets/projects/lifelong-memory/bucket.mp4" type="video/mp4">
    </video>
    <p><strong>Query:</strong> Where did I put the bucket?<br><strong>LLM:</strong> The bucket is mentioned as being put on the ground twice in this interval.</p>
  </div>
  <div class="item">
    <video muted loop playsinline controls preload="metadata" width="600">
      <source src="/assets/projects/lifelong-memory/fridge.mp4" type="video/mp4">
    </video>
    <p><strong>Query:</strong> What did I put in the refrigerator?<br><strong>LLM:</strong> You put a bottle in the refrigerator.</p>
  </div>
  <div class="item">
    <video muted loop playsinline controls preload="metadata" width="600">
      <source src="/assets/projects/lifelong-memory/fueltank.mp4" type="video/mp4">
    </video>
    <p><strong>Query:</strong> Did I leave the fuel tank open?<br><strong>LLM:</strong> You opened the tank, but it is not specified whether you left it open or not.</p>
  </div>
  <div class="item">
    <video muted loop playsinline controls preload="metadata" width="600">
      <source src="/assets/projects/lifelong-memory/keg.mp4" type="video/mp4">
    </video>
    <p><strong>Query:</strong> What color is the keg I picked from the floor?<br><strong>LLM:</strong> You picked up a jerrycan from the ground and put it down on the floor, but the color of the keg is not specified in the memory.</p>
  </div>
  <div class="item">
    <video muted loop playsinline controls preload="metadata" width="600">
      <source src="/assets/projects/lifelong-memory/drink.mp4" type="video/mp4">
    </video>
    <p><strong>Query:</strong> Where was the can drink before I drank it?<br><strong>LLM:</strong> C picks a can. This is the action before C drank from the can.</p>
  </div>
  <div class="item">
    <video muted loop playsinline controls preload="metadata" width="600">
      <source src="/assets/projects/lifelong-memory/wood.mp4" type="video/mp4">
    </video>
    <p><strong>Query:</strong> How many wood planks did I carry?<br><strong>LLM:</strong> C carries the wood. The exact number of planks is not specified.</p>
  </div>
  <div class="item">
    <video muted loop playsinline controls preload="metadata" width="600">
      <source src="/assets/projects/lifelong-memory/egg.mp4" type="video/mp4">
    </video>
    <p><strong>Query:</strong> Where was the egg before I picked it?<br><strong>LLM:</strong> The egg was in the fridge before you picked it.</p>
  </div>
</div>

## Quantitative Evaluation {data-toc=Evaluation}

Our approach achieves state-of-the-art performance on the EgoSchema benchmark for question answering and is highly competitive on the natural language query (NLQ) challenge of Ego4D.

![](qa_results.png){width=800}

![](nlq_results.png){width=800}

We also quantitatively evaluate our proposed framework with different captioning models, LLMs, pre-processing techniques, and prompts. Please read our paper for more details.

## Video Presentation {data-toc=Video}

<figure class="tw-text-center tw-my-10">
  <video autoplay muted loop controls playsinline preload="metadata" style="max-width: 700px; width: 100%; height: auto; margin: 0 auto; border-radius: 0.25rem;">
    <source src="/assets/projects/lifelong-memory/lifelongmemory_full.mp4" type="video/mp4">
  </video>
</figure>
