<script>
  import { onMount } from 'svelte';

  // Dimensions of the SVG viewBox
  const width = 800;
  const height = 600;
  const numStars = 100;

  // Determine a grid for even distribution
  let rows = Math.floor(Math.sqrt(numStars));
  let cols = Math.ceil(numStars / rows);

  let stars = [];

  // Generate stars with fixed positions
  function createStars() {
    stars = [];
    const cellWidth = width / cols;
    const cellHeight = height / rows;
    let count = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (count < numStars) {
          const cx = c * cellWidth + Math.random() * cellWidth;
          const cy = r * cellHeight + Math.random() * cellHeight;
          // Random radius between 0.5 and 2
          const rValue = 0.5 + Math.random() * 1.5;
          // Negative delay so that the animation is offset from the start
          const delay = -Math.random() * 3;
          stars.push({ id: count, cx, cy, r: rValue, delay });
          count++;
        }
      }
    }
  }

  onMount(() => {
    createStars();
  });
</script>

<style>
  /* Background fills the entire viewport */
  .background {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
    overflow: hidden;
  }

  /* Keyframes that create a flicker/grow/disappear effect.
     We use CSS variables --tx and --ty for the fixed position translation. */
  @keyframes starEffect {
    0%   { opacity: 0.8; transform: translate(var(--tx), var(--ty)) scale(1); }
    25%  { opacity: 0.2; transform: translate(var(--tx), var(--ty)) scale(0.8); }
    50%  { opacity: 0.6; transform: translate(var(--tx), var(--ty)) scale(1.2); }
    75%  { opacity: 0.2; transform: translate(var(--tx), var(--ty)) scale(0.9); }
    100% { opacity: 0.8; transform: translate(var(--tx), var(--ty)) scale(1); }
  }
  
  .star {
    animation: starEffect 3s infinite;
    animation-fill-mode: both;
  }
</style>

<div class="background">
  <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" class="w-full h-full">
    <defs>
      <!-- Radial gradient for a cosmic background -->
      <radialGradient id="bgGradient" cx="50%" cy="50%" r="70%">
        <stop offset="0%" stop-color="#0f2027" />
        <stop offset="50%" stop-color="#203a43" />
        <stop offset="100%" stop-color="#2c5364" />
      </radialGradient>
    </defs>
    <!-- Background rectangle -->
    <rect width="800" height="600" fill="url(#bgGradient)" />
    <!-- Render stars at fixed positions using CSS variables for translation -->
    {#each stars as star (star.id)}
      <circle
        class="star"
        r={star.r}
        fill="#fff"
        style="--tx: {star.cx}px; --ty: {star.cy}px; animation-delay: {star.delay}s;"
      />
    {/each}
  </svg>
</div>

<section class="hero min-h-screen bg-transparent">
  <div class="hero-content text-center">
    <div class="max-w-md">
      <h1 class="text-5xl font-bold text-white">Welcome to Project Stratum!</h1>
      <p class="py-6 text-white">Your journey to innovation starts here.</p>
    </div>
  </div>
</section>