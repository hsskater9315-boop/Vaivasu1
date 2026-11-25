import os
import zipfile

def create_archive():
    ignore_dirs = {'.git', 'node_modules', 'dist', 'dev-dist', '.aistudio', '__pycache__'}
    allowed_dot_files = {'.env.example', '.gitignore'}
    
    output_dir = 'public'
    os.makedirs(output_dir, exist_ok=True)
    output_zip = os.path.join(output_dir, 'forvasu-source-code.zip')
    
    # Remove existing if any
    if os.path.exists(output_zip):
        os.remove(output_zip)

    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk('.'):
            # Prune ignored directories
            dirs[:] = [d for d in dirs if d not in ignore_dirs and not d.startswith('.')]
            for file in files:
                if file.endswith('.zip'):
                    continue
                if file.startswith('.') and file not in allowed_dot_files:
                    continue
                filepath = os.path.join(root, file)
                arcname = os.path.relpath(filepath, '.')
                zipf.write(filepath, arcname)

    print(f'Archive created: {output_zip} ({os.path.getsize(output_zip)} bytes)')

if __name__ == '__main__':
    create_archive()
