const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

async function getAvailableVRAM() {
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      // macOS (Unified Memory)
      const { stdout } = await execAsync("sysctl hw.memsize | awk '{print $2}'");
      const totalMem = parseInt(stdout.trim(), 10);
      // macOS doesn't have a simple way to get "free" VRAM for unified memory from CLI like nvidia-smi.
      // We'll estimate available as a fraction of total, or try to get more details.
      // Actually, vm_stat can give us a hint.
      const { stdout: vmStat } = await execAsync("vm_stat | grep 'Pages free' | awk '{print $3}'");
      const freePages = parseInt(vmStat.replace('.', ''), 10);
      const pageSize = 4096; // Standard page size
      return freePages * pageSize;
    } else if (platform === 'linux') {
      // Linux/WSL (NVIDIA)
      try {
        const { stdout } = await execAsync("nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits");
        const freeMemMB = parseInt(stdout.trim(), 10);
        return freeMemMB * 1024 * 1024;
      } catch (e) {
        // Fallback or not an NVIDIA system
        return 0;
      }
    }
  } catch (err) {
    console.error("[VRAM] Error detecting VRAM:", err.message);
  }
  return 0;
}

/**
 * Calculates N (number of candidates) based on available VRAM.
 * N = floor((Available_VRAM * 0.66) / Estimated_KV_Cache_Per_Request)
 */
async function calculateN() {
  const availableVRAM = await getAvailableVRAM();
  if (availableVRAM === 0) return 1;

  // Estimated KV Cache Per Request (very rough estimate, e.g., 500MB for a decent context)
  const estimatedKVCache = process.env.ESTIMATED_KV_CACHE_BYTES || (512 * 1024 * 1024);
  const n = Math.floor((availableVRAM * 0.66) / estimatedKVCache);

  return Math.max(1, n);
}

module.exports = { getAvailableVRAM, calculateN };
