## Documentation for `dnx64.py`

### Overview

The `dnx64.py` file provides a Python wrapper for the `DNX64.dll` library, which allows users to interact with a Dino-Lite or Dino-Eye device using Python. The `DNX64` class in the file contains methods that correspond to functions in the DLL, offering functionalities such as setting camera properties, getting device information, and controlling the camera lens. 

The Python API and example code are provided on GitHub repository (https://github.com/dino-lite/DNX64-Python-API).

### DNX64 Class

#### `__init__(self, dll_path: str) -> None`
- Initializes the `DNX64` class.
- Parameters:
  - `dll_path` (str): Path to the `DNX64.dll` library file.

### Methods

The `DNX64` class provides various methods to interact with the camera. Below are some examples of the methods and their descriptions. Each method corresponds to a function in the `DNX64.dll` library.

- `Init(self) -> bool`
  - Initializes the microscope camera.
  - Returns:
    - `bool`: `True` if successful, `False` otherwise.

- `GetVideoDeviceCount(self) -> int`
  - Gets the number of available video devices.
  - Returns:
    - `int`: Number of video devices.

- `SetAETarget(self, device_index: int, ae_target: int) -> None`
  - Sets the auto-exposure target value for the specified device.
  - Parameters:
    - `device_index` (int): Index of the device.
    - `ae_target` (int): Auto-exposure target value.

- `SetExposureValue(self, device_index: int, exposure_value: int) -> None`
  - Sets the exposure value for the specified device.
  - Parameters:
    - `device_index` (int): Index of the device.
    - `exposure_value` (int): Exposure value.

- `SetVideoDeviceIndex(self, set_device_index: int) -> None`
  - Sets the video device index.
  - Parameters:
    - `set_device_index` (int): Video device index to set.

Please note that the documentation provided here is a brief overview of some of the methods in the `DNX64` class. For a complete list of methods and detailed descriptions, please refer to the comments in the `dnx64.py` file.

### Usage

To use the `DNX64` class, first import it and initialize it with the path to the `DNX64.dll` library file. Then, you can call the methods to interact with the camera.

```plaintext
from dnx64 import DNX64

# Initialize the DNX64 class
dll_path = "path_to_DNX64.dll"
microscope = DNX64(dll_path)

# Set Device Index first
microscope.SetVideoDeviceIndex(0)

# Initialize the control object
if microscope.Init():
    # Get the number of video devices
    device_count = microscope.GetVideoDeviceCount()
    print(f"Number of video devices: {device_count}")

    # Set the auto-exposure target value for device 0
    microscope.SetAETarget(0, 100)

    # Set the exposure value for device 0
    microscope.SetExposureValue(0, 1000)
```

Please refer to the `example.py` file for an example of how to use the `DNX64` class with `opencv-python`to control a microscope camera and capture images and video.

## Information Charts
### GetConfig():

| Bit   | Name  | Type | Value                                 |
|-------|-------|------|---------------------------------------|
| [7]   | EDOF  | Read | 1 = Supported, 0 = Not supported      |
| [6]   | AMR   | Read | 1 = Supported, 0 = Not supported      |
| [5]   | eFLC  | Read | 1 = Supported, 0 = Not supported      |
| [4]   | APL   | Read | 1 = Supported, 0 = Not supported      |
| [3:2] | LED   | Read | 00 = Not switchable                   |
|       |       |      | 01 = 2 Modes (on & off)               |
|       |       |      | 10 = 3 Modes (LED 1, LED2, off)       |
|       |       |      | 11 = Reserved                         |
| [1]   | FLC   | Read | 1 = Supported, 0 = Not supported      |
| [0]   | AXI   | Read | 1 = Supported, 0 = Not supported      |

### Value Index for Get/Set VideoAmpProc functions

| Value | Parameter  | Value | Parameter            |
|-------|------------|-------|----------------------|
| 0     | Brightness | 5     | Gamma                |
| 1     | Contrast   | 6     | ColorEnable          |
| 2     | Hue        | 7     | WhiteBalance         |
| 3     | Saturation | 8     | BacklightCompensation|
| 4     | Sharpness  | 9     | Gain                 |

### SetExposure()
| Series     | Exposure Range | Series      | Exposure Range |
|------------|----------------|-------------|----------------|
| 3011, 3013 | 8 to 30612     | 1.3M Premier| 1 to 41771     |
| 1.3M Edge  | 1 to 63076     | 5M Premier  | 1 to 30000     |
| 5M Edge    | 1 to 30000     |             |                |

### SetFLCSwitch()
| Value | Switch-on Quadrant | Value | Switch-on Quadrant |
|-------|--------------------|-------|--------------------|
| 1     | 1                  | 9     | 1, 4               |
| 2     | 2                  | 10    | 2, 4               |
| 3     | 1, 2               | 11    | 1, 2, 4            |
| 4     | 3                  | 12    | 3, 4               |
| 5     | 1, 3               | 13    | 1, 3, 4            |
| 6     | 2, 3               | 14    | 2, 3, 4            |
| 7     | 1, 2, 3            | 15    | 1, 2, 3, 4         |
| 8     | 4                  | 16    | All LEDs turn off  |

### SetLEDState
| Values | Description |
|--------|-------------|
| 0      | LED off     |
| 1      | LED1 on     |
| 2      | LED2 on.    |
###### * LED2 only exists on models with 2 switchable LEDs.
