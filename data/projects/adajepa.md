---
mathjax: true
equal_label: Equal advising
affiliations:
  - { name: 'Ying Wang',      aff: ['New York University', 'AMI Labs'] }
  - { name: 'Oumayma Bounou', aff: 'New York University' }
  - { name: 'Yann LeCun',     aff: ['New York University', 'AMI Labs'], url: 'http://yann.lecun.com/', equal: true }
  - { name: 'Mengye Ren',     aff: 'New York University', equal: true }
bibtex: |
  @misc{wang2026adajepaadaptivelatentworld,
        title={AdaJEPA: An Adaptive Latent World Model}, 
        author={Ying Wang and Oumayma Bounou and Yann LeCun and Mengye Ren},
        year={2026},
        eprint={2606.32026},
        archivePrefix={arXiv},
        primaryClass={cs.LG},
        url={https://arxiv.org/abs/2606.32026}, 
  }
links:
  arxiv: https://arxiv.org/abs/2606.32026
  pdf: https://arxiv.org/pdf/2606.32026
  code: https://github.com/agentic-learning-ai-lab/adajepa
---

## Overview

![AdaJEPA performs a closed-loop plan-act-adapt-replan cycle. At each MPC step, the agent plans with the current world model, executes the first action, observes the next transition, updates the model using latent prediction error, and replans with the adapted model.](main_loop.png){width=900}

Latent world models make planning from high-dimensional observations tractable by predicting future states in a compact representation space. However, standard world-model planners freeze the model after training. Inaccurate predictions, especially severe under test distribution shift, can make MPC optimize actions for the wrong imagined future, hindering planning.

AdaJEPA addresses this by adapting the world model during deployment. Each action executed by MPC produces a new transition $(o_t, a_t, o_{t+1})$, which becomes a self-supervised training signal before the next replan. This couples learning and planning in a simple loop: plan, act, adapt, and replan.

## Method

AdaJEPA starts from a pretrained JEPA world model with a sensory encoder $\mathcal{E}^s_\phi$, an action encoder $\mathcal{E}^a_\psi$, and a latent predictor $f_\theta$. Given a goal observation $o_g$, MPC plans in latent space by rolling out the predictor and minimizing the distance to the goal representation $z_g = \mathcal{E}^s_\phi(o_g)$:

$$
a^*_{t:t+H-1}
=
\arg\min_{a_{t:t+H-1}}
\sum_{k=1}^{H}
\alpha_k\, d(\hat z_{t+k}, z_g).
$$

After executing the first action, AdaJEPA stores the observed transition in a small online buffer and adapts the model by minimizing the latent prediction objective:

$$
\mathcal{L}_{\rm ada}(\mathcal{B})
=
\frac{1}{|\mathcal{B}|}
\sum_{(o_i,a_i,o_{i+1})\in\mathcal{B}}
\ell\!\left(
f_\theta\!\left(z_i,\mathcal{E}^a_\psi(a_i)\right),
\operatorname{sg}(z_{i+1})
\right).
$$

Our proposed adaptation is very lightweight: by default, we use one gradient step per MPC replan, a replay buffer of five recent transitions, and updates restricted to the final layers of the visual encoder and predictor. See the ablations in the paper for alternative adaptation targets, learning rates, update steps, and buffer choices.

![AdaJEPA closed-loop plan-and-adapt algorithm.](algo.png){width=900}

## Results

<div class="adajepa-results-compact">

AdaJEPA improves planning in both in-distribution and out-of-distribution settings. In-distribution, adaptation is safe to apply: it improves performance when the frozen model is suboptimal and preserves strong baselines when the frozen model is already near-optimal. Under distribution shift, AdaJEPA gives consistent gains because each observed transition helps recalibrate the model before the next replan.

![Shape shifts change the shapes in PushObj; stars mark held-out object shapes.](all_shapes_gd_cem_ttt.png){width=900}

![Visual shifts corrupt PushT observations with blur, salt-and-pepper noise, dark lighting, and color changes.](pusht_visual_shifts_gd_cem_ttt.png){width=900}

Across PushObj shape shifts and PushT visual shifts, adaptation improves planning by recalibrating the latent world model to the object or observation stream encountered at test time.

![Dynamics shifts change PointMaze physics; layout shifts test held-out maze layouts.](dynamic_layout_tab.png){width=900}

On PointMaze dynamics shifts, the frozen model is already strong, likely because the three-frame history gives it some in-context learning to the current dynamics. AdaJEPA still improves beyond this baseline by updating the world model from the observed transition. On unseen layouts, adaptation improves success and makes trajectories closer to shortest paths.

![Training data scale varies PushObj shape diversity K and trajectories per shape N.](shapescale7_success_lines.png){width=585}

Data scaling improves both frozen and adaptive models, but test-time adaptation is especially valuable when offline data is limited. On low-data seen shapes, AdaJEPA can more than double frozen-model success and even outperform frozen models trained with much more data.

</div>

## Visualization

These examples illustrate how adaptation leads to better prediction and planning. Blue denotes the frozen model and red denotes AdaJEPA. A star (★) marks an unseen test shape or configuration, where decoded rollouts can still reconstruct reasonably while retaining training-domain structure. Although the decoder is frozen after training on default data, it still produces meaningful rollouts after lightweight test-time adaptation. This suggests that AdaJEPA improves planning by exploiting shared latent structure and recalibrating predictions, while remaining close to the learned latent manifold.

<div class="adajepa-video-row">
  <figure>
    <video autoplay muted loop playsinline preload="metadata"><source src="/assets/projects/adajepa/pushobj_plus_frozen.mp4" type="video/mp4"></video>
    <figcaption>Ex. 1: PushObj +, frozen.</figcaption>
  </figure>
  <figure>
    <video autoplay muted loop playsinline preload="metadata"><source src="/assets/projects/adajepa/pushobj_plus_adapt.mp4" type="video/mp4"></video>
    <figcaption>Ex. 1: PushObj +, AdaJEPA.</figcaption>
  </figure>
  <figure>
    <video autoplay muted loop playsinline preload="metadata"><source src="/assets/projects/adajepa/pushobj_i_frozen.mp4" type="video/mp4"></video>
    <figcaption>Ex. 2: PushObj I★, frozen.</figcaption>
  </figure>
  <figure>
    <video autoplay muted loop playsinline preload="metadata"><source src="/assets/projects/adajepa/pushobj_i_adapt.mp4" type="video/mp4"></video>
    <figcaption>Ex. 2: PushObj I★, AdaJEPA.</figcaption>
  </figure>
</div>

<div class="adajepa-video-row">
  <figure>
    <video autoplay muted loop playsinline preload="metadata"><source src="/assets/projects/adajepa/pusht_blur_frozen.mp4" type="video/mp4"></video>
    <figcaption>Ex. 3: PushT blur★, frozen.</figcaption>
  </figure>
  <figure>
    <video autoplay muted loop playsinline preload="metadata"><source src="/assets/projects/adajepa/pusht_blur_adapt.mp4" type="video/mp4"></video>
    <figcaption>Ex. 3: PushT blur★, AdaJEPA.</figcaption>
  </figure>
  <figure>
    <video autoplay muted loop playsinline preload="metadata"><source src="/assets/projects/adajepa/pusht_red_frozen.mp4" type="video/mp4"></video>
    <figcaption>Ex. 4: PushT red★, frozen.</figcaption>
  </figure>
  <figure>
    <video autoplay muted loop playsinline preload="metadata"><source src="/assets/projects/adajepa/pusht_adapt_frozen.mp4" type="video/mp4"></video>
    <figcaption>Ex. 4: PushT red★, AdaJEPA.</figcaption>
  </figure>
</div>

<div class="adajepa-example-grid">
  <figure><img src="/assets/projects/adajepa/medium_density0.2_damping1_no_ttt_failure0_left.png" alt="Low mass frozen trajectory"><figcaption>Low mass★: frozen.</figcaption></figure>
  <figure><img src="/assets/projects/adajepa/medium_density0.2_damping1_ttt_predlast_enclast_success0_left.png" alt="Low mass AdaJEPA trajectory"><figcaption>Low mass★: AdaJEPA.</figcaption></figure>
  <figure><img src="/assets/projects/adajepa/medium_density1.0_damping20_no_ttt_failure2_left.png" alt="High damping frozen trajectory"><figcaption>High damping★: frozen.</figcaption></figure>
  <figure><img src="/assets/projects/adajepa/medium_density1.0_damping20_ttt_predlast_enclast_success2_left.png" alt="High damping AdaJEPA trajectory"><figcaption>High damping★: AdaJEPA.</figcaption></figure>
</div>

<div class="adajepa-example-grid">
  <figure><img src="/assets/projects/adajepa/diverse_maze_no_ttt_failure1_left.png" alt="Maze 1 frozen trajectory"><figcaption>Maze 1★: frozen.</figcaption></figure>
  <figure><img src="/assets/projects/adajepa/diverse_maze_ttt_success1_left.png" alt="Maze 1 AdaJEPA trajectory"><figcaption>Maze 1★: AdaJEPA.</figcaption></figure>
  <figure><img src="/assets/projects/adajepa/diverse_maze_no_ttt_failure2_left.png" alt="Maze 2 frozen trajectory"><figcaption>Maze 2★: frozen.</figcaption></figure>
  <figure><img src="/assets/projects/adajepa/diverse_maze_ttt_success2_left.png" alt="Maze 2 AdaJEPA trajectory"><figcaption>Maze 2★: AdaJEPA.</figcaption></figure>
</div>

## Takeaways

AdaJEPA suggests that world models should continue learning during deployment rather than remain frozen after training. By improving predictions from the transitions encountered while planning and acting, adaptive world models can support more resilient perception and planning in a changing world.
