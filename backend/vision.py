# backend/vision.py
import json
import sys
from PIL import Image
from ultralytics import YOLO

# Load the YOLOv8-nano model. 
# The model will be downloaded automatically the first time this is run.
try:
    model = YOLO('yolov8n.pt')
except Exception as e:
    print(json.dumps({"error": f"Failed to load YOLO model: {e}"}))
    sys.exit(1)

def perform_detection(image_path, roi_box):
    """
    Performs real YOLO object detection on a cropped region of an image.
    """
    try:
        img = Image.open(image_path)
    except FileNotFoundError:
        return {"error": f"Image file not found at {image_path}"}

    # Crop the image to the selected Region of Interest
    cropped_img = img.crop(roi_box)
    
    # Perform detection
    results = model(cropped_img, verbose=False) # verbose=False to reduce console output
    
    detected_objects = []
    # Process results
    for result in results:
        boxes = result.boxes
        for box in boxes:
            xyxy = box.xyxy[0].tolist()
            # The coordinates are relative to the crop, so we need to offset them
            # back to the original image's coordinate system.
            absolute_box = [
                xyxy[0] + roi_box[0],
                xyxy[1] + roi_box[1],
                xyxy[2] + roi_box[0],
                xyxy[3] + roi_box[1],
            ]
            
            detected_objects.append({
                "class_name": model.names[int(box.cls)],
                "confidence": float(box.conf),
                "box": absolute_box,
            })
            
    return detected_objects

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python vision.py <roi_json_string>"}))
        sys.exit(1)

    try:
        roi_arg = json.loads(sys.argv[1])
        
        # Convert ROI to a bounding box tuple (x0, y0, x1, y1)
        roi_box = (
            roi_arg["x"], 
            roi_arg["y"], 
            roi_arg["x"] + roi_arg["width"], 
            roi_arg["y"] + roi_arg["height"]
        )

        # The image to analyze is now image.png
        # The script assumes image.png is in the same directory (backend/)
        detections = perform_detection("image.png", roi_box)
        
        # Output the results as a JSON string to stdout
        print(json.dumps(detections))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)