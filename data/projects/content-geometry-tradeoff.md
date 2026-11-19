---
mathjax: true
equal_label: Equal contribution
affiliations:
  - { name: 'Mengye Ren',        aff: 'New York University' }
  - { name: 'Ying Wang',         aff: 'New York University', equal: true }
  - { name: 'Chris Hoang',        aff: 'New York University', equal: true }
  - { name: 'Yilun Kuang',       aff: 'New York University' }
  - { name: 'Yann LeCun',        aff: ['New York University', 'AMI Labs'], url: 'http://yann.lecun.com/' }
bibtex: |
  @misc{ren2026content,
    title  = {The Content--Geometry Tradeoff in World Models: When {JEPA} Learns Latent Maps},
    author = {Ren, Mengye and Wang, Ying and Hoang, Christopher and Kuang, Yilun and LeCun, Yann},
    year   = {2026}
  }
links: {}
---

## Overview

![(a) One first-person route through the Medium maze in each latent (jag: route jaggedness, 1 is smooth; succ: planning success on hard goals). (b) Held-out readout R² of the PushT agent and resting block, six seeds. SVReg learns a smooth map but can lose the block, and Slow SVReg keeps both.](teaser.png){width=1000}

A latent world model for planning needs two properties. Latent distances should track progress toward a goal (*geometry*), and task-relevant factors should stay decodable from the latent (*content*). Training without collapse usually relies on a stop-gradient (SG) target or on a variance regularizer trained without SG. We find that both choices often give poor geometry.

Sliced variance regularization (SVReg) puts a variance floor on the latent along random directions. It learns a smooth map of the agent's state, but it can drop slowly changing, hard-to-predict factors such as the pose of a manipulated object. Slow SVReg adds a slowness term and a gated residual predictor, which favor these factors. It keeps them, plans best in the hard settings of five visual control tasks, and learns latent maps from first-person mazes and city walks.

## Method

![(a) SVReg floors the standard deviation of the latent along random directions. (b) Slow channels change slowly between frames. (c) The gated residual predictor copies the current latent and learns the change.](method.png){width=1000}

SVReg puts a one-sided floor on the standard deviation of the latent along random unit directions $\mathbf{u}$:

$$\mathcal{R}_{\mathrm{SVReg}}(z) = \mathbb{E}_{\mathbf{u}}\!\left[\max\!\left(0,\,1-\mathrm{std}_t(\mathbf{z}_t \cdot \mathbf{u})\right)^2\right].$$

A small fixed set of slow channels $\mathbf{b}_t$ gets a variance-normalized slowness term, so persistent factors such as a resting cube keep room in the latent:

$$\mathcal{R}_{\mathrm{slow}}(\mathbf{b}) = \frac{\mathbb{E}_t\|\mathbf{b}_{t+1}-\mathbf{b}_t\|^2}{2\,\mathrm{tr}\,\mathrm{Var}(\mathbf{b})}.$$

The predictor copies the current latent and learns the change, scaled by a per-dimension gate $\mathbf{c}$ initialized at 0.1:

$$\hat{\mathbf{z}}_{t+1} = \mathbf{z}_t + \mathbf{c}\odot f(\mathbf{z}_{\le t},\mathbf{a}_t).$$

## Latent maps

SVReg and Slow SVReg lay out the maze in the leading principal components of the latent, from top-down and first-person views alike.

![Top two principal components of each latent on PointMaze, coloured by the agent's position.](maze_pca.png){width=900}

![Slow SVReg on egocentric PointMaze Large, a smooth tour through the maze: first-person view, top-down position and the top three principal components of the latent.](large_maze_tour_3d.mp4){width=1000}

## Content

On Cube, SVReg loses the cube height in three of six seeds, the ones whose random initial encoder reads the least height. From the same starts, SG and Slow SVReg acquire it.

![Held-out cube-height readout during training on Cube. Dashed: SG and SVReg seeds 2, 3 and 5.](cube_height.png){width=600}

![Cube, one held-out episode with two lifts: the camera next to the top three principal components of SG, SIGReg-BN and Slow SVReg. Colour: cube height while grasped.](cube_compare_3d.mp4){width=1000}

## Planning

<figure class="paper-fig">
<figcaption class="paper-cap"><strong>Slow SVReg plans best in the hard settings.</strong> Planning success (%), mean ± s.d. over six training seeds. Hard goals on the mazes, all goals on Cube. Bold: best; underline: second best.</figcaption>
<div class="paper-scroll">
<table class="paper-table">
<thead>
<tr><th></th><th colspan="3" class="c cm">Navigation and reaching</th><th colspan="2" class="c cm">Object manipulation</th></tr>
<tr><th>Method</th><th class="s">U-maze</th><th class="s">Medium</th><th class="s">Reacher</th><th class="s">Cube</th><th class="s">PushT</th></tr>
</thead>
<tbody>
<tr class="group"><td colspan="6">Stop-gradient</td></tr>
<tr><td>SG</td><td>65.0<span class="sd">±18.7</span></td><td>71.6<span class="sd">±8.7</span></td><td>86.5<span class="sd">±1.6</span></td><td>80.4<span class="sd">±2.1</span></td><td>44.0<span class="sd">±19.3</span></td></tr>
<tr><td>SG + straightening</td><td>88.0<span class="sd">±3.1</span></td><td>72.8<span class="sd">±5.6</span></td><td>86.6<span class="sd">±2.9</span></td><td>85.4<span class="sd">±1.0</span></td><td>62.1<span class="sd">±7.7</span></td></tr>
<tr><td>SG + SVReg</td><td>95.8<span class="sd">±1.1</span></td><td>62.7<span class="sd">±6.2</span></td><td>96.3<span class="sd">±1.6</span></td><td>77.2<span class="sd">±1.3</span></td><td><u>76.9</u><span class="sd">±4.3</span></td></tr>
<tr class="group rule"><td colspan="6">No stop-gradient</td></tr>
<tr><td>VICReg</td><td>94.3<span class="sd">±2.3</span></td><td>77.2<span class="sd">±2.3</span></td><td>93.1<span class="sd">±1.7</span></td><td>69.6<span class="sd">±5.8</span></td><td>55.0<span class="sd">±3.6</span></td></tr>
<tr><td>SIGReg-BN</td><td>82.2<span class="sd">±13.7</span></td><td>78.2<span class="sd">±3.8</span></td><td>95.8<span class="sd">±1.3</span></td><td><u>87.4</u><span class="sd">±0.8</span></td><td>60.4<span class="sd">±2.6</span></td></tr>
<tr class="ours"><td>SVReg (ours)</td><td><u>96.4</u><span class="sd">±1.3</span></td><td><u>81.3</u><span class="sd">±2.3</span></td><td><u>98.7</u><span class="sd">±0.9</span></td><td>76.9<span class="sd">±8.8</span></td><td>75.0<span class="sd">±8.6</span></td></tr>
<tr class="ours"><td>Slow SVReg (ours)</td><td><strong>98.7</strong><span class="sd">±0.7</span></td><td><strong>84.7</strong><span class="sd">±2.7</span></td><td><strong>99.6</strong><span class="sd">±0.4</span></td><td><strong>89.1</strong><span class="sd">±1.6</span></td><td><strong>87.3</strong><span class="sd">±3.8</span></td></tr>
</tbody>
</table>
</div>
</figure>

## City walks

We train on first-person walks rendered from 3D Gaussian-splat reconstructions of real city blocks (Wanderland), with actions and no poses. The walked layout appears in the top two principal components of the Slow SVReg latent.

![Wanderland scene 13Skv: held-out walks in the top two principal components of each latent, coloured by true position.](city_map.png){width=1000}

![A smooth walk around the block: first-person view, top-down position and the top three principal components of the Slow SVReg latent.](city_walk_3d.mp4){width=1000}

![The top three principal components of five latents, rotating. SVReg and Slow SVReg trace the walked loop as a thin curve, and the other objectives spread the frames into a cloud.](city_pca3d_compare.mp4){width=1000}
