"""
PyTorch-based training script for sign language recognition
Compatible with Python 3.13
"""
import os
import numpy as np
from PIL import Image
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
import time

IMG_SIZE = 64
DATA_DIR = "ISL_Dataset"
BATCH_SIZE = 32
EPOCHS = 15
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

print(f"Using device: {DEVICE}")

# Load dataset
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
            img = Image.open(img_path).convert('RGB')
            img = img.resize((IMG_SIZE, IMG_SIZE))
            img_array = np.array(img) / 255.0
            
            data.append(img_array)
            labels.append(i)
            img_count += 1
        except Exception as e:
            print(f"  Skipped {img_name}: {str(e)}")
            continue
    
    print(f"  Loaded {img_count} images")

data = np.array(data)
labels = np.array(labels)

print(f"\nDataset Summary:")
print(f"  Total samples: {len(data)}")
print(f"  Total classes: {len(label_map)}")
print(f"  Classes: {label_map}")

# Save labels
os.makedirs("model", exist_ok=True)
np.save("labels.npy", label_map)
print("Labels saved to labels.npy")

# Convert to tensors
X_train, X_test, y_train, y_test = train_test_split(
    data, labels, test_size=0.2, random_state=42
)

X_train = torch.FloatTensor(X_train).permute(0, 3, 1, 2)
X_test = torch.FloatTensor(X_test).permute(0, 3, 1, 2)
y_train = torch.LongTensor(y_train)
y_test = torch.LongTensor(y_test)

# Create DataLoaders
train_dataset = torch.utils.data.TensorDataset(X_train, y_train)
train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)

test_dataset = torch.utils.data.TensorDataset(X_test, y_test)
test_loader = DataLoader(test_dataset, batch_size=BATCH_SIZE, shuffle=False)

# Define CNN model
class SignLanguageCNN(nn.Module):
    def __init__(self, num_classes):
        super(SignLanguageCNN, self).__init__()
        self.conv1 = nn.Conv2d(3, 32, kernel_size=3, padding=1)
        self.pool1 = nn.MaxPool2d(2, 2)
        self.conv2 = nn.Conv2d(32, 64, kernel_size=3, padding=1)
        self.pool2 = nn.MaxPool2d(2, 2)
        
        # Calculate flattened size: (64x64) -> (32x32) -> (16x16)
        self.fc1 = nn.Linear(64 * 16 * 16, 128)
        self.fc2 = nn.Linear(128, num_classes)
        self.relu = nn.ReLU()
        
    def forward(self, x):
        x = self.pool1(self.relu(self.conv1(x)))
        x = self.pool2(self.relu(self.conv2(x)))
        x = x.view(x.size(0), -1)
        x = self.relu(self.fc1(x))
        x = self.fc2(x)
        return x

# Initialize model
model = SignLanguageCNN(len(label_map)).to(DEVICE)
criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=0.001)

# Training loop
print("\nTraining model...")
print("=" * 60)

for epoch in range(EPOCHS):
    model.train()
    train_loss = 0.0
    train_correct = 0
    train_total = 0
    
    for batch_idx, (images, labels_batch) in enumerate(train_loader):
        images, labels_batch = images.to(DEVICE), labels_batch.to(DEVICE)
        
        optimizer.zero_grad()
        outputs = model(images)
        loss = criterion(outputs, labels_batch)
        loss.backward()
        optimizer.step()
        
        train_loss += loss.item()
        _, predicted = torch.max(outputs.data, 1)
        train_total += labels_batch.size(0)
        train_correct += (predicted == labels_batch).sum().item()
    
    train_accuracy = 100 * train_correct / train_total
    avg_train_loss = train_loss / len(train_loader)
    
    # Validation
    model.eval()
    val_correct = 0
    val_total = 0
    with torch.no_grad():
        for images, labels_batch in test_loader:
            images, labels_batch = images.to(DEVICE), labels_batch.to(DEVICE)
            outputs = model(images)
            _, predicted = torch.max(outputs.data, 1)
            val_total += labels_batch.size(0)
            val_correct += (predicted == labels_batch).sum().item()
    
    val_accuracy = 100 * val_correct / val_total
    print(f"Epoch [{epoch+1}/{EPOCHS}] Loss: {avg_train_loss:.4f}, Train Acc: {train_accuracy:.2f}%, Val Acc: {val_accuracy:.2f}%")

# Test the model
print("\n" + "=" * 60)
model.eval()
test_correct = 0
test_total = 0
with torch.no_grad():
    for images, labels_batch in test_loader:
        images, labels_batch = images.to(DEVICE), labels_batch.to(DEVICE)
        outputs = model(images)
        _, predicted = torch.max(outputs.data, 1)
        test_total += labels_batch.size(0)
        test_correct += (predicted == labels_batch).sum().item()

test_accuracy = 100 * test_correct / test_total
print(f"Test Accuracy: {test_accuracy:.4f} ({test_accuracy:.2f}%)")
print("=" * 60)

# Save model (convert to ONNX or save state dict for compatibility)
model_path = "model/sign_model.pt"
torch.save(model.state_dict(), model_path)
print(f"\n✓ Model saved to {model_path}")
print(f"  Classes: {list(label_map.values())}")
