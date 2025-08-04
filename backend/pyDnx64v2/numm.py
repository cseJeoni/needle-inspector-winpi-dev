import cv2

# 用於存儲數字字符的字符串
input_string = ""
img = cv2.imread('logo.jpg')   # 開啟圖片，預設使用 cv2.IMREAD_COLOR 模式
cv2.imshow('oxxostudio', img) 

while True:

    # 等待按鍵輸入，並將結果存儲在 key 中
  key = cv2.waitKey(25) & 0xff
  if key == 13:  # 回車鍵的ASCII碼為13
      break

  # 如果按下數字鍵，將字符附加到輸入字符串
  if 48 <= key <= 57:  # ASCII碼48到57表示0到9的數字
      input_string += chr(key)
print("輸入的數字:", input_string)      
# 關閉 OpenCV 視窗
cv2.destroyAllWindows()
