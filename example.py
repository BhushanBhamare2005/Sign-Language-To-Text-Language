import numpy as np
labels = np.load("labels.npy", allow_pickle=True).item()
print(labels)