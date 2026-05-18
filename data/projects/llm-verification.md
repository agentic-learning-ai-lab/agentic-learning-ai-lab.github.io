---
mathjax: true
affiliations:
  - { name: 'Jack Lu',     aff: 'New York University', url: 'https://jacklu-me.com',                                       equal: true }
  - { name: 'Ryan Teehan', aff: 'New York University', url: 'https://rteehas.github.io/',                                  equal: true }
  - { name: 'Jinran Jin',  aff: 'New York University', url: 'https://www.linkedin.com/in/jinran-jin-093252319/' }
  - { name: 'Mengye Ren',  aff: 'New York University' }
links:
  code: https://github.com/agentic-learning-ai-lab/llm-verification
bibtex: |
  @misc{lu2025llmverification,
    title         = {When Does Verification Pay Off? A Closer Look at LLMs as Solution Verifiers},
    author        = {Jack Lu and Ryan Teehan and Jinran Jin and Mengye Ren},
    year          = {2025},
    eprint        = {2512.02304},
    archivePrefix = {arXiv},
    primaryClass  = {cs.CL}
  }
---

## Overview of Our Study {data-toc=Overview}

Let's quickly go over our experimental setup, how we measure verification ability, and different verification settings.

### Models

We treat every model as both a **solver** and a **verifier**. As a solver, each model generates a chain-of-thought solution per problem; as a verifier, it reads the original problem and a solution to decide whether the solution is correct (also with chain-of-thought). We evaluate 37 models, including 21 post-trained and 16 base models from the <span class="model-llama3">Llama3</span>, <span class="model-qwen25">Qwen2.5</span>, <span class="model-qwen3">Qwen3</span>, and <span class="model-deepseek">DeepSeek-R1</span> families spanning 0.5B–72B parameters.

### Datasets

We evaluate our models on 6 real-world tasks ([**GSM8K**](https://huggingface.co/datasets/openai/gsm8k), [**AIME**](https://huggingface.co/datasets/TianHongZXY/aime-1983-2025), [**CSQA**](https://huggingface.co/datasets/tau/commonsense_qa), [**GPQA**](https://huggingface.co/datasets/Idavidrein/gpqa), [**MMLU-STEM**](https://huggingface.co/datasets/cais/mmlu), and [**MMLU-Social-Sciences**](https://huggingface.co/datasets/cais/mmlu)) and 3 synthetic tasks (3SAT, Sudoku, and Matrix Multiplication).

### Metrics

Verifier performance has multiple dimensions, so we track classification metrics like accuracy, false positive rate (FPR), false negative rate (FNR), and also the downstream effect of verifier-based rejection sampling via **verifier gain**, defined as

$$
\underbrace{Gain(S, V; D)}_{\substack{\text{performance improvement} \\ \text{from using verifier}}}
\;=\;
\underbrace{Precision(S, V; D)}_{\substack{\text{accuracy after test-time} \\ \text{rejection sampling with verifier}}}
\;-\;
\underbrace{SolverAccuracy(S; D)}_{\text{base solver's accuracy}}
$$

where $V$ is a verifier, $S$ is a solver, and $D$ is a dataset.

### Verification Settings

We compare three ways of pairing solvers and verifiers:

- **Self-Verification:** the same model acts as both solver and verifier.
- **Intra-Family Verification:** solver and verifier come from the same model family but have different sizes.
- **Cross-Family Verification:** solver and verifier are drawn from different model families or differ in base vs. post-trained.

## Does Verifier Gain Predict Improvements from Resampling? {data-toc="Verifier Gain"}

Our verifier gain metric estimates the expected improvement in a solver's accuracy when using a verifier for rejection sampling. To assess how well this metric predicts real performance, we conduct rejection sampling experiments across all solver-verifier pairs from a 12-model subset of our post-trained models. For each problem in each dataset, the solver generates solutions until the verifier labels one as correct, for up to 10 attempts; if no such solution is found, we retain the final attempt.

> Verifier gain reliably predicts rejection sampling gains and serves as a powerful comparative metric for evaluating solver–verifier pairs. Crucially, it can be estimated from a single verification round without costly rejection sampling experiments.

![](results_empirical_gap_scatterplot-1.png){width=600}

## Do Better Solvers Make Better Verifiers? {data-toc="Solver Skill"}

We first analyze whether a model's solver performance correlates with its performance as a verifier. For each of our 21 post-trained models and each dataset, we evaluate verification on the same set of solver models to obtain verifier accuracy, FPR, FNR, and gain for every solver-verifier pair. For each verifier, we then divide the verifier metrics into three verification settings and average within each setting over solvers and datasets. From the figure below, we realize the answer to this question depends on the verification setting and discover the following takeaways.

> - Verifier models are biased toward accepting incorrect solutions when performing self-verification or intra-family verification.
> - Verification accuracy alone is not a reliable predictor of how much a verifier can improve a solver at test time. Instead, computing verifier gain using solver accuracy and verifier precision provides a more reliable metric.
> - While model families like <span class="model-llama3">Llama3</span> and <span class="model-qwen25">Qwen2.5</span> some ability to self-improve, stronger model families like <span class="model-deepseek">DeepSeek</span> and <span class="model-qwen3">Qwen3</span> do not, which we find is linked to the latter already spontaneously self-verifying during solving (73–96% vs. 1–2%).

![](results_cross_dataset_verifier_scatterplots_solver_acc-1.png){width=600}

## Are Verifiers Biased Toward Solutions That Resemble Their Own? {data-toc="Similarity Bias"}

From the last sections, we saw that reasoning models benefit less from self- and intra-family verification due to high FPR (in comparison to cross-family verification), hinting at an LLM bias in accepting incorrect solutions that resemble their own. To directly investigate this behavior, we conduct cross-verification experiments using 12 post-trained models and compute all verifier metrics for each pair. For each pair, we plot the verifier metric against the **solver-verifier similarity score**, defined as the average cosine similarity between the two models' solution embeddings across all dataset problems. The figure below confirms this hypothesis.

> Higher similarity between solver and verifier solution distributions increases the verifier's tendency to accept incorrect solver outputs, reducing verifier gain. Using a verifier with a meaningfully different solution distribution mitigates this bias.

![](results_verifier_similarity_scatterplot-1.png){width=500}

## How Does Reasoning Post-Training Affect Solver and Verifier Performance? {data-toc=Post-Training}

Our analysis focuses on the <span class="model-qwen25">Qwen2.5-Base</span>/<span class="model-qwen25">Qwen2.5</span> and <span class="model-qwen3">Qwen3-Base</span>/<span class="model-qwen3">Qwen3</span> model pairs. For each model, we compute verifier metrics against all solvers and datasets, partition results by verification setting, and average within families. From the figure below, we realize the following takeaway.

> Reasoning post-training significantly improves problem-solving but can reduce self- and intra-family verification gains, while boosting cross-family verification performance.

![](results_posttraining_verifier_barplots_remove_llama-1.png){width=600}

## How Does Task Type Affect Verifiability? {data-toc="Task Type"}

Thus far, we have examined verifier performance and its contribution to solver accuracy through rejection sampling. We now shift to a task-level perspective and ask two questions:

- *Are tasks that are easy to solve also easy to verify?*
- *Are some tasks inherently easier to verify than others?*

For each of our 21 post-trained models and each dataset, we evaluate verification on the same set of solver models to obtain verifier accuracy and gain for every solver-verifier pair, average them across all verifier models, and plot them against solver accuracies. From the figure below, we realize the following takeaway.

> Although tasks that are easy to solve are typically easier to verify, some tasks are inherently easier to verify. These include synthetic problems with logical or structured reasoning (e.g., 3SAT, Sudoku) and real-world tasks relying primarily on mathematical reasoning rather than extensive factual recall (e.g., GSM8K, AIME). Such tasks also yield larger gains from test-time rejection sampling with verifiers.

![](results_cross_dataset_task_scatterplots-1.png){width=900}

## A Checklist for Designing Effective Solver-Verifier Systems {data-toc=Checklist}

> - **Use verifier gain, not accuracy, to evaluate a solver-verifier pair.** Verification accuracy can be misleading, while verifier gain strongly predicts actual rejection sampling gains.
> - **Check whether the task is easier to verify than to solve.** Logical and mathematical reasoning tasks yield higher verifier gains than knowledge-recall tasks.
> - **Prefer verifiers that "think differently" from the solver.** Solution-distribution similarity increases false positives and reduces gains.
> - **Avoid using strong reasoning models as their own verifiers.** State-of-the-art models such as <span class="model-qwen3">Qwen3</span> and <span class="model-deepseek">DeepSeek</span> achieve minimal self-improvement, despite being strong solvers.
