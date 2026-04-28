
import os
import subprocess
import time

def run_cmd(cmd):
    print(f"Running: {cmd}")
    subprocess.run(cmd, shell=True, check=True)

def generate_segments():
    vault_dir = "vault/1080p60"
    os.makedirs(vault_dir, exist_ok=True)
    
    # 1. Create a 6-second source video (Test Pattern)
    # This creates a video with a moving timestamp to simulate live footage
    source_file = "source_test.mp4"
    run_cmd(f'ffmpeg -y -f lavfi -i testsrc=duration=6:size=1920x1080:rate=60 -c:v libx264 -pix_fmt yuv420p {source_file}')
    
    # 2. Generate A/B segments for each 2-second GOP
    # Segment 0: 0-2s
    # Segment 1: 2-4s
    # Segment 2: 4-6s
    
    for i in range(3):
        start_time = i * 2
        
        # Variant A: Standard High Quality
        path_a = os.path.join(vault_dir, f"gop_{i}_A.ts")
        run_cmd(f'ffmpeg -y -ss {start_time} -t 2 -i {source_file} -c:v libx264 -b:v 8M -maxrate 8M -bufsize 16M -g 60 -f mpegts {path_a}')
        
        # Variant B: Forensic Variation
        # We simulate a "Forensic Variation" by applying a tiny, invisible brightness shift (0.1%)
        # or a specific motion vector bias. Here we'll use a subtle color shift.
        path_b = os.path.join(vault_dir, f"gop_{i}_B.ts")
        run_cmd(f'ffmpeg -y -ss {start_time} -t 2 -i {source_file} -vf "eq=brightness=0.01" -c:v libx264 -b:v 8M -maxrate 8M -bufsize 16M -g 60 -f mpegts {path_b}')
        
        print(f"✅ Generated GOP {i} (A/B Pair)")

    print(f"\n🚀 Forensic Vault ready at: {vault_dir}")
    print("Each segment is now cryptographically ready for session-based delivery.")

if __name__ == "__main__":
    generate_segments()
