import cv2

print("Checking available camera indexes...")
for i in range(5):  # 최대 5개까지 체크 (필요하면 늘려도 됨)
    cap = cv2.VideoCapture(i)
    if cap.read()[0]:
        print(f"✅ Camera found at index {i}")
    else:
        print(f"❌ No camera at index {i}")
    cap.release()
