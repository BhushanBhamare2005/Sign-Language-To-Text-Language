"""
Mock training script that creates dummy model files for testing
when TensorFlow is not properly installed
"""
import numpy as np
import os
from PIL import Image
import pickle

IMG_SIZE = 64
DATA_DIR = "ISL_Dataset"  # Changed to ISL_Dataset which has images

data = []
labels = []
label_map = {}

print("Loading dataset images...")
for i, folder in enumerate(sorted(os.listdir(DATA_DIR))):
    folder_path = os.path.join(DATA_DIR, folder)
    if not os.path.isdir(folder_path):
        continue
    
    label_map[i] = folder
    print(f"Loading class {i}: {folder}")
    
    img_count = 0
    for img_name in os.listdir(folder_path):
        img_path = os.path.join(folder_path, img_name)
        
        try:
            # Load image using PIL to validate it's a real image
            img = Image.open(img_path).convert('RGB')
            # Resize to target size
            img = img.resize((IMG_SIZE, IMG_SIZE))
            # Convert to array
            img_array = np.array(img) / 255.0
            
            data.append(img_array)
            labels.append(i)
            img_count += 1
        except Exception as e:
            print(f"  Skipped {img_name}: {str(e)}")
            continue
    
    print(f"  Loaded {img_count} images")

print(f"\nDataset Summary:")
print(f"  Total samples: {len(data)}")
print(f"  Total classes: {len(label_map)}")
print(f"  Classes: {label_map}")

# Save labels
os.makedirs("model", exist_ok=True)
np.save("labels.npy", label_map)
print("Labels saved to labels.npy")

if len(data) > 0:
    data = np.array(data)
    
    # Create a simple mock model and save as pickle
    # This is just for testing purposes
    mock_model = {
        'type': 'cnn_mock',
        'num_classes': len(label_map),
        'img_size': IMG_SIZE
    }
    
    model_path = "model/sign_model_mock.pkl"
    with open(model_path, 'wb') as f:
        pickle.dump(mock_model, f)
    
    print(f"\n✓ Mock model metadata saved to {model_path}")
    print(f"  Classes: {list(label_map.values())}")
    print(f"\nNote: This is a mock model for testing purposes.")
    print(f"To use the actual CNN model, install TensorFlow properly and run with actual training.")
else:
    print("\nNo images found in ISL_Dataset directory.")
    print("Please ensure the dataset is in the ISL_Dataset folder.")
