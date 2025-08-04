from dnx64 import DNX64
from win32api import GetFileVersionInfo, LOWORD, HIWORD
import threading
import time
import cv2
import math
import ctypes

# Constants
WINDOW_WIDTH, WINDOW_HEIGHT = 1280, 960
CAMERA_WIDTH, CAMERA_HEIGHT, CAMERA_FPS = 1280, 960, 30
PA = 'C:\\WINDOWS\\SYSTEM\\setupcl.dll'
DNX64_PATH = 'C:\\Program Files\\DNX64\\DNX64.dll'
#DNX64_PATH = 'C:\\DNX64Src_110\\x64\\Release\\DNX64.dll'
DEVICE_INDEX = 0
QUERY_TIME = 0.05 # Buffer time for Dino-Lite to return value
COMMAND_TIME = 0.25 # Buffer time to allow Dino-Lite to process command 

# Initialize microscope
microscope = DNX64(DNX64_PATH)
      
def getVersion(filename):
   info = GetFileVersionInfo (filename, "\\")
   ms = info['FileVersionMS']
   ls = info['FileVersionLS']
   return HIWORD (ms), LOWORD (ms), HIWORD (ls), LOWORD (ls)
       

def threaded(func):
    """Wrapper to run a function in a separate thread with @threaded decorator"""
    def wrapper(*args, **kwargs):
        thread = threading.Thread(target=func, args=args, kwargs=kwargs)
        thread.start()
    return wrapper

def custom_microtouch_function():
    """Executes when MicroTouch press detected"""
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    clear_line(1)
    print(f"{timestamp} MicroTouch press detected!", end='\r')
    
def print_amr():
    config = microscope.GetConfig(DEVICE_INDEX)
    if((config&0x40)==0x40):
      amr = microscope.GetAMR(DEVICE_INDEX)
      amr = round(amr,1)
      clear_line(1)    
      print(f"{amr}x", end='\r')
      time.sleep(QUERY_TIME)
    else:
      clear_line(1)    
      print(f"It does not belong to the AMR serie.", end='\r')    

def print_config():
    config = microscope.GetConfig(DEVICE_INDEX)
    clear_line(1)
    print("Config value =",end="")
    print("0x{:X}".format(config) ,end="")
    if((config&0x80)==0x80):
      print(", EDOF" ,end="")
    if((config&0x40)==0x40):
      print(", AMR" ,end="" )  
    if((config&0x20)==0x20):
      print(", eFLC" ,end="" ) 
    if((config&0x10)==0x10):
      print(", Aim Point Laser" ,end="" )        
    if((config&0xc)==0x4):
      print(", 2 segments LED" ,end="" )
    if((config&0xc)==0x8):
      print(", 3 segments LED" ,end="" )
    if((config&0x2)==0x2):
      print(", FLC" ,end="" ) 
    if((config&0x1)==0x1):
      print(", AXI") 
    print("", end='\r')                                
    #print(microscope.GetConfig(DEVICE_INDEX))
    time.sleep(QUERY_TIME)

def clear_line(n=1):
    LINE_CLEAR = '\x1b[2K'
    for i in range(n):
        print("", end=LINE_CLEAR)
                
def set_index():    
    microscope.SetVideoDeviceIndex(0)
    time.sleep(COMMAND_TIME)

def print_fov_mm():
    amr = microscope.GetAMR(DEVICE_INDEX)
    fov = microscope.FOVx(DEVICE_INDEX,amr)
    amr = round(amr,1)
    fov = round(fov / 1000,2)
    if(fov == math.inf): 
        fov =  round(microscope.FOVx(DEVICE_INDEX,50.0) / 1000.0,2)
        clear_line(1)
        print("50x fov: ", fov ,"mm", end='\r')
    else:
        clear_line(1)
        print(f"{amr}x fov: ",  fov ,"mm", end='\r') 
    time.sleep(QUERY_TIME)

def print_deviceid():
    clear_line(1)
    print(microscope.GetDeviceId(0), end='\r')
    time.sleep(QUERY_TIME)

@threaded
def flash_leds():
    microscope.SetLEDState(0,0)
    time.sleep(COMMAND_TIME)
    microscope.SetLEDState(0,1)
    time.sleep(COMMAND_TIME)
    clear_line(1)
    print(f"flash_leds", end='\r')
    
def led_off():
    microscope.SetLEDState(0,0)
    time.sleep(COMMAND_TIME)
    clear_line(1)    
    print(f"led off", end='\r')
    
def capture_image(frame):
    """Capture an image and save it in the current working directory."""
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    filename = f"image_{timestamp}.png"
    cv2.imwrite(filename, frame)
    clear_line(1)
    print(f"Saved image to {filename}", end='\r')

def start_recording(frame_width, frame_height, fps):
    """Start recording video and return the video writer object."""
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    filename = f"video_{timestamp}.avi"
    fourcc = cv2.VideoWriter.fourcc(*'XVID')
    video_writer = cv2.VideoWriter(filename, fourcc, fps, (frame_width, frame_height))
    clear_line(1)
    print(f"Video recording started: {filename}. Press r to stop.", end='\r')
    return video_writer

def stop_recording(video_writer):
    """Stop recording video and release the video writer object."""
    video_writer.release()
    clear_line(1)    
    print("Video recording stopped", end='\r')

def initialize_camera():
    """Setup OpenCV camera parameters and return the camera object."""
    camera = cv2.VideoCapture(DEVICE_INDEX, cv2.CAP_DSHOW)
    camera.set(cv2.CAP_PROP_FPS, CAMERA_FPS)
    camera.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter.fourcc('m','j','p','g'))
    camera.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter.fourcc('M','J','P','G'))
    camera.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
    camera.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
    return camera

def process_frame(frame):
    """Resize frame to fit window."""
    return cv2.resize(frame, (WINDOW_WIDTH, WINDOW_HEIGHT))

def start_camera():
    """Starts camera, initializes variables for video preview, and listens for shortcut keys."""
    camera = initialize_camera()

    if not camera.isOpened():
        print('Error opening the camera device.')
        return

    recording = False
    video_writer = None
    inits = True

    print('Press the key below prompts to continue \n 0:Led off \n 1:AMR \n 2:Flash_leds and On \n c:List config \n d:Show devicd id \n f:Show fov \n r:Record video or Stop Record video \n s:Capture image. \n Esc:Quit')
    while True:
        ret, frame = camera.read()
        if ret:
            resized_frame = process_frame(frame)
            cv2.imshow('Dino-Lite Camera', resized_frame)

            if recording:
                video_writer.write(frame)
            if inits:
                #time.sleep(0.25)
                microscope.SetVideoDeviceIndex(DEVICE_INDEX) # Set index of video device. Call before Init().
                #time.sleep(0.25)
                #microscope.Init() # Initialize the control object. Required before using other methods, otherwise return values will fail or be incorrect.
                time.sleep(0.1)
                microscope.EnableMicroTouch(True) # Enabled MicroTouch Event
                time.sleep(0.1)
                microscope.SetEventCallback(custom_microtouch_function) # Function to execute when MicroTouch event detected
                time.sleep(0.1)
                inits = False
        key = cv2.waitKey(1) & 0xff
        if key == ord('0'):      
        # Press '0' to set_index()
        #    set_index()
        # Press '0' to led off
            led_off()
        if key == ord('1'):
            #
            print_amr()

        # Press '2' to flash LEDs
        if key == ord('2'):
            flash_leds()
        
        # Press 'f' to show fov
        if key == ord('f'):
            print_fov_mm()
            
        # Press 'd' to show device id
        if key == ord('d'):
            print_deviceid()

        # Press 's' to save a snapshot
        if key == ord('s'):
            capture_image(frame)

        # Press 's' to save a snapshot
        if key == ord('c'):
            print_config()

        if key == ord('6'):
            microscope.SetEFLC(0,1,32)
            time.sleep(0.1)
            microscope.SetEFLC(0,1,31)
 
        if key == ord('7'):
            microscope.SetEFLC(0,2,32)
            time.sleep(0.1)        
            microscope.SetEFLC(0,2,15)
            
        if key == ord('8'):
            microscope.SetEFLC(0,3,32)
            time.sleep(0.1)        
            microscope.SetEFLC(0,3,15)
            
        if key == ord('9'):
            microscope.SetEFLC(0,4,32)
            time.sleep(0.1)        
            microscope.SetEFLC(0,4,31)                                   
                        
        # Press 'r' to start recording
        if key == ord('r') and not recording:
            recording = True
            video_writer = start_recording(CAMERA_WIDTH, CAMERA_HEIGHT, CAMERA_FPS)

        # Press 'SPACE' to stop recording
        elif key == ord('r') and recording:
            recording = False
            stop_recording(video_writer)

        # Press ESC to close
        if key == 27:
            clear_line(1)            
            break

    if video_writer is not None:
        video_writer.release()
    camera.release()
    cv2.destroyAllWindows()

def main():

    print(getVersion(DNX64_PATH))
    start_camera()



if __name__ == "__main__":
    main()
