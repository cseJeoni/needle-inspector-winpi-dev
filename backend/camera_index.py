import cv2
import time

def find_available_cameras():
    """
    0번부터 10번까지의 카메라 인덱스를 확인하고
    사용 가능한 카메라 리스트를 반환합니다.
    """
    
    # 확인할 최대 인덱스 번호 (0~10까지 확인)
    max_index_to_check = 10
    found_indices = []

    print(f"0번부터 {max_index_to_check}번까지 카메라 인덱스를 검색합니다...")
    print("-" * 30)

    for index in range(max_index_to_check + 1):
        print(f"인덱스 {index} 확인 중...", end='')
        
        # 카메라 캡처 객체 생성
        # cv2.CAP_DSHOW: 윈도우에서 DirectShow API를 사용하여 더 빠르고 안정적으로 장치를 엽니다.
        # (다른 OS에서는 이 옵션을 빼도 무방합니다.)
        cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
        
        # isOpened() 함수로 카메라가 성공적으로 열렸는지 확인
        if cap.isOpened():
            print(f"  -> [성공] 카메라를 찾았습니다.")
            found_indices.append(index)
            # ★★★ 중요 ★★★
            # 확인 후에는 반드시 release()를 호출하여 장치를 해제해야 합니다.
            # 그렇지 않으면 다음 인덱스 확인에 실패하거나 다른 프로그램이 카메라를 쓸 수 없습니다.
            cap.release()
        else:
            print(f"  -> [실패] 카메라 없음")
            # 실패 시에도 혹시 모를 리소스 점유를 위해 release() 호출
            cap.release()

        time.sleep(1)

    print("-" * 30)
    
    if not found_indices:
        print("검색 결과: 0-10 범위에서 사용 가능한 카메라를 찾지 못했습니다.")
    else:
        print(f"검색 완료! 사용 가능한 카메라 인덱스: {found_indices}")

    return found_indices

if __name__ == "__main__":
    # 스크립트 실행
    available_cameras = find_available_cameras()