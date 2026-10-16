import numpy as np
import os
from PIL import Image

IMG_SIZE = 64
DATA_DIR = "ISL_Dataset"  # Changed to ISL_Dataset which has images

data = []
labels = []
label_map = {}

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


data = np.array(data)  # Already normalized during loading
labels = tf.keras.utils.to_categorical(labels)

print(f"\nDataset Summary:")
print(f"  Total samples: {len(data)}")
print(f"  Total classes: {len(label_map)}")
print(f"  Classes: {label_map}")

# Save labels
os.makedirs("model", exist_ok=True)
np.save("labels.npy", label_map)
print("Labels saved to labels.npy")

# Split data
from sklearn.model_selection import train_test_split
X_train, X_test, y_train, y_test = train_test_split(data, labels, test_size=0.2)

# CNN Model
model = tf.keras.models.Sequential([
    tf.keras.layers.Conv2D(32, (3,3), activation='relu', input_shape=(64,64,3)),
    tf.keras.layers.MaxPooling2D(),

    tf.keras.layers.Conv2D(64, (3,3), activation='relu'),
    tf.keras.layers.MaxPooling2D(),

    tf.keras.layers.Flatten(),
    tf.keras.layers.Dense(128, activation='relu'),
    tf.keras.layers.Dense(len(label_map), activation='softmax')
])

model.compile(optimizer='adam',
              loss='categorical_crossentropy',
              metrics=['accuracy'])

model.fit(X_train, y_train, epochs=15, batch_size=32, validation_split=0.1, verbose=1)

print("\n" + "="*60)
loss, acc = model.evaluate(X_test, y_test, verbose=0)
print(f"Test Accuracy: {acc:.4f} ({acc*100:.2f}%)")
print(f"Test Loss: {loss:.4f}")
print("="*60)

model_path = "model/sign_model.h5"
model.save(model_path)
print(f"\n✓ Model saved to {model_path}")
