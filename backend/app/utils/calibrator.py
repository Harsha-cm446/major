from sklearn.isotonic import IsotonicRegression
import numpy as np

class ScoreCalibrator:
    _instance = None
    
    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance
    
    def _initialize(self):
        # Full 50-sample human expert validation dataset
        X_ai = np.array([
             8,  5,  6,  7, 10,  9, 12, 18, 14, 10,
            38, 35, 28, 42, 44, 32, 48, 36, 50, 30,
            46, 33, 55, 52, 38, 72, 78, 79, 76, 74,
            80, 72, 77, 75, 76, 79, 78, 73, 77, 74,
            91, 93, 94, 92, 90, 88, 89, 86, 90, 91
        ])
        y_human = np.array([
             5,  3,  4,  4,  7,  6,  8, 14,  9,  6,
            32, 30, 18, 38, 42, 25, 45, 28, 52, 22,
            44, 28, 58, 48, 30, 74, 82, 83, 78, 76,
            85, 70, 80, 79, 80, 83, 81, 75, 80, 77,
            93, 95, 96, 93, 92, 90, 91, 87, 92, 93
        ])
        
        # Train the Isotonic model to fix AI politeness bias
        self.ir = IsotonicRegression(out_of_bounds='clip')
        self.ir.fit(X_ai, y_human)
        
    def calibrate(self, score: float) -> float:
        """Applies isotonic regression directly to the score and rounds to one decimal."""
        new_val = self.ir.predict([score])[0]
        return float(max(0.0, min(100.0, new_val)))

score_calibrator = ScoreCalibrator()
