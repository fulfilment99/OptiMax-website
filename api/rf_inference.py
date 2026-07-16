"""
Pure-Python Random Forest inference.
--------------------------------------
Walks the raw decision-tree arrays exported from the trained
scikit-learn RandomForestClassifier (see export_model.py) and reproduces
predict_proba() exactly, using only the Python standard library -- no
scikit-learn, scipy, or numpy at runtime. This keeps the deployed
serverless function's dependency footprint near zero, since scikit-learn's
scipy dependency was what pushed the Vercel function bundle over its
225MB size limit.
"""

import json
import os

_MODEL_PATH = os.path.join(os.path.dirname(__file__), "crusher_model_export.json")
_model_cache = None


def load_model():
    global _model_cache
    if _model_cache is None:
        with open(_MODEL_PATH) as f:
            _model_cache = json.load(f)
    return _model_cache


def _predict_tree_proba(tree, x):
    """Walk a single tree's arrays from the root until a leaf, return that leaf's class proba row."""
    node = 0
    children_left = tree["children_left"]
    children_right = tree["children_right"]
    feature = tree["feature"]
    threshold = tree["threshold"]
    proba = tree["proba"]

    while children_left[node] != -1:  # -1 marks a leaf in sklearn's tree_ arrays
        f = feature[node]
        if x[f] <= threshold[node]:
            node = children_left[node]
        else:
            node = children_right[node]
    return proba[node]


def predict_proba(feature_dict):
    """
    feature_dict: dict of {feature_name: value}, matching model["feature_order"].
    Returns: dict of {class_name: probability}, averaged across all trees
    (this reproduces sklearn RandomForestClassifier.predict_proba exactly).
    """
    model = load_model()
    x = [feature_dict[name] for name in model["feature_order"]]
    classes = model["classes"]
    n_classes = len(classes)

    sums = [0.0] * n_classes
    for tree in model["trees"]:
        leaf_proba = _predict_tree_proba(tree, x)
        for i in range(n_classes):
            sums[i] += leaf_proba[i]

    n_trees = len(model["trees"])
    avg = [s / n_trees for s in sums]
    return dict(zip(classes, avg))
