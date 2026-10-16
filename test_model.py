import os
import cv2
import mediapipe as mp
import tensorflow as tf
import numpy as np
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

model = tf.keras.models.load_model("sign_model.h5", compile=False)

raw_labels = np.load("labels.npy", allow_pickle=True).item()

labels = raw_labels if not isinstance(list(raw_labels.keys())[0], str) else {
    v: k for k, v in raw_labels.items()
}

if len(labels) != model.output_shape[-1]:
    own_images_dir = os.path.join(os.path.dirname(__file__), 'dataset', 'own_images')
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

base_options = python.BaseOptions(
    model_asset_path='hand_landmarker.task'
)

options = vision.HandLandmarkerOptions(
    base_options=base_options,
    num_hands=2
)

detector = vision.HandLandmarker.create_from_options(options)


def predict_sign(frame):

    h, w, _ = frame.shape

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    mp_image = mp.Image(
        image_format=mp.ImageFormat.SRGB,
        data=rgb
    )

    result = detector.detect(mp_image)

    if result.hand_landmarks:

        all_x = []
        all_y = []

        for hand in result.hand_landmarks:
            for lm in hand:
                all_x.append(lm.x)
                all_y.append(lm.y)

        xmin = max(0, int(min(all_x) * w) - 40)
        xmax = min(w, int(max(all_x) * w) + 40)
        ymin = max(0, int(min(all_y) * h) - 40)
        ymax = min(h, int(max(all_y) * h) + 40)

        if ymax > ymin and xmax > xmin:

            combined_crop = frame[ymin:ymax, xmin:xmax]

            hand_img = cv2.resize(combined_crop, (64, 64))

            hand_img = hand_img / 255.0

            hand_img = np.reshape(hand_img, (1, 64, 64, 3))

            prediction = model.predict(hand_img, verbose=0)

            index = np.argmax(prediction)

            confidence = float(np.max(prediction))

            text = labels.get(index, "Unknown sign")

            return {
                "text": text,
                "confidence": confidence,
                "signs": [text]
            }

    return {
        "text": "",
        "confidence": 0.0,
        "signs": []
    }