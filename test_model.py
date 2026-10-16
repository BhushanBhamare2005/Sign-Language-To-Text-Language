import os
import tensorflow as tf
import numpy as np
from PIL import Image

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

project_dir = os.path.dirname(os.path.abspath(__file__))
model = tf.keras.models.load_model(os.path.join(project_dir, 'sign_model.h5'), compile=False)

raw_labels = np.load(os.path.join(project_dir, 'labels.npy'), allow_pickle=True).item()

labels = raw_labels if not isinstance(list(raw_labels.keys())[0], str) else {
    v: k for k, v in raw_labels.items()
}

if len(labels) != model.output_shape[-1]:
    own_images_dir = os.path.join(project_dir, 'dataset', 'own_images')
    class_names = []
    if os.path.isdir(own_images_dir):
        class_names = sorted(
            name for name in os.listdir(own_images_dir)
            if os.path.isdir(os.path.join(own_images_dir, name))
        )
    if len(class_names) != model.output_shape[-1]:
        class_names = [str(number) for number in range(10)] + list('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    if len(class_names) == model.output_shape[-1]:
        labels = dict(enumerate(class_names))

def predict_sign(frame):
    if frame is None or not isinstance(frame, np.ndarray) or frame.size == 0:
        return {"text": "", "confidence": 0.0, "signs": []}

    hand_img = np.asarray(
        Image.fromarray(frame).convert('RGB').resize((64, 64)),
        dtype=np.float32
    ) / 255.0
    prediction = model.predict(hand_img[np.newaxis, ...], verbose=0)[0]
    index = int(np.argmax(prediction))
    text = labels.get(index, "Unknown sign")

    return {
        "text": text,
        "confidence": float(np.max(prediction)),
        "signs": [text]
    }