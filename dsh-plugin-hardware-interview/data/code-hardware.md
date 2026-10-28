# 两工程硬件配置对照（从源码提取）

> 范围：只提取硬件相关配置（引脚/外设/电平/上拉/时钟/中断/PWM/总线），不总结 PID 与软件逻辑。
> 方法：逐文件读 `遥控/User/main.c`、`遥控/APP/*`、`遥控/Public/*` 与 `FreeRTOS小车/USER/main.c`、`FreeRTOS小车/HARDWARE/LED/*`、`SYSTEM/usart`、`FreeRTOSConfig.h`；库文件只用于核对时钟树与启动文件。
> 结论标注：**已确认**＝有代码证据；**未配置**＝工程里确实没有；**未确认**＝代码算不出实物值，需测量。

## 一、模块对照表

| 模块 | 遥控工程（遥控/） | FreeRTOS 工程（FreeRTOS小车/） | 风险/追问 |
|---|---|---|---|
| 系统时钟 | HSE 8MHz，PLL×9=72MHz；HCLK 72、APB2 72、APB1 36；TIM2/3/4=72MHz（`system_stm32f10x.c:1022-1056`，`main.c:99`） | 完全相同（`FreeRTOS小车/USER/system_stm32f10x.c` 同版本，`main.c:143` 先设 NVIC 分组） | 两工程都假设 8MHz 晶振；uvprojx 里 `CLOCK(12000000)` 只是 Keil 仿真参数，别当晶振值 |
| USART1 | **未配置**：全工程无 `uart_init/USART_Init`，只在 `stm32f10x_conf.h:48` 引了 usart 头文件；无线链路全走 nRF | **已配置**：PA9=TX `AF_PP`、PA10=RX `IN_FLOATING`；115200-8-N-1、无流控；RXNE 中断抢占 3/子 3（`usart.c:78-105`，`main.c:145`） | 车端 3 号抢占高于 `configMAX_SYSCALL=5`，中断里调 FreeRTOS API 会崩；printf 是阻塞轮询 |
| 软 I2C + MPU6050 | **已配置**：PB6=SCL/PB7=SDA，开漏 50MHz，每电平 `delay_us(10)`→SCL≈50kHz；地址 0xD0（AD0=0），采样 100Hz、DLPF 5Hz、±2000°/s、±16g（`MyI2C.c:15-64`，`MPU6050.c:7,58-63`） | **未配置**：工程无 `MPU6050.c`，pitch/roll 由 nRF 无线帧传过来（`main.c:190-203`） | "车自己会不会算姿态"→不会；遥控端 `MyI2C.c:61` 注释写 PB10/PB11 与实际 PB6/PB7 矛盾，需核对实物走线 |
| 软 I2C + OLED | **已配置**：PB8=SCL、PB9=SDA，开漏 50MHz，上电空循环等供电稳定；地址 0x78（7 位 0x3C）（`OLED.c:82,99,128-133,201`） | **已配置**：PB9=SCL、PB8=SDA（**与遥控端对调**），其余相同，地址 0x78（`OLED.c:82,99,201`） | 两工程同名驱动接法相反，模块不能直接换线序；SCL 实际频率**未确认**（无软件延时） |
| nRF24L01 软件 SPI | PA0=CSN、PA1=CE、PA2=SCK、PA3=MOSI（推挽 50MHz）；PA4=MISO、PA5=IRQ（IPU）；发射端 2440MHz/2Mbps/0dBm/32B/16 位 CRC（`nRF24L01_API.c:3-9,159-185,219`） | PA2=CSN、PA3=CE、PA4=SCK、PA5=MOSI（推挽）；PB0=MISO、PB1=IRQ（IPU）；接收端多通道 CH0=0x11×5、CH1=0x22×5，ACK=0xAA×5（`nRF24L01_API.c:3-8,147,172-178,243`） | 两工程引脚完全不同，换工程必须改线；车端 PA5 与 LED1 复用（见 R2） |
| 定时/PWM | TIM4 仅作 1ms 更新中断：PSC=71、ARR=999，72MHz/(72×1000)=**1kHz**；NVIC 抢占 2/子 3（`time4.c:16-33`，`main.c:103`） | TIM2_CH1=PA0、CH2=PA1 复用推挽；PSC=35、ARR=99，72MHz/(36×100)=**20kHz**，占空比=CCR/100（`PWM.c:17-31`） | 两工程 TIM4 用途不同（时基 vs 编码器）；遥控端未调 `NVIC_PriorityGroupConfig`，默认分组 0 下子优先级 3 被忽略 |
| 电机驱动 | **未配置**（遥控端无电机） | TB6612 方向：PB12/PB13=左、PB14/PB15=右（推挽 50MHz，`Motor.c:16,35-57`）；速度=PA0/PA1 PWM | 代码里没有 STBY 脚，TB6612 的 STBY 必须硬件拉高，否则电机不转 |
| 编码器 | **未配置**（TIM3 未用，TIM4 做时基） | 左轮 TIM3：PA6/PA7，IPU，PSC=0、ARR=65535，TI12 双沿（`Encoder.c:18-45`）；右轮 TIM4：PB6/PB7，IPU，TI12，CH1 Rising/CH2 Falling（反相）（`Encoder.c:56-85`） | 仅内部上拉（30–50kΩ），长线/开漏编码器易丢脉冲；代码按 52 计数/转换算，实物线数**未确认** |
| LED | PC13=LED0（推挽 50MHz，默认高=灭）、PA7=LED8（默认低）；`led.h` 还定义了 PB0、PA1–PA6 但未初始化（`led.c:23-27,57-59`，`led.h:45-53`） | PC13=LED0、PA5=LED1（推挽 50MHz，默认高）（`led.c:23-35`）；注释写 PB5/PE5 是模板残留 | PC13 是备份域脚，手册限 3mA/2MHz，代码配 50MHz 推挽；`led.h` 的 PA1–PA5 与 nRF 引脚重叠 |
| 按键 | PB12/PB13/PB14/PB15/PA8 共 5 键，全部 `GPIO_Mode_IPU`（低有效），TIM4 1ms 中断里扫描，长按 500ms（`key.c:29-51`，`key.h:60`） | **未配置**：main 初始化序列无 Key，工程无 key.c（`main.c:141-151`） | 遥控端多键同按会失效；车端若实物有急停键，代码没有读取路径 |
| 其他传感器 | DHT22 单总线 PA12（推挽输出/IPU 输入动态切换，`dht22.c:140-155`，`dht22.h:6-8`），但 main **从未调用** DHT22_Init | **未配置** | `dht22.c:119` 会用 `GPIO_SetBits(GPIOA,GPIO_Pin_1)` 拉高 PA1＝nRF CE，启用后会踢掉无线 |
| RTOS 硬件项 | 无 RTOS（SysTick 仅延时，时钟 HCLK/8=9MHz，`SysTick.c:12-14`） | SysTick=HCLK 72MHz，1ms 节拍（LOAD=72000）；PRIO_BITS=4，KERNEL=0xF0、MAX_SYSCALL=0x50；tickless 关闭（`FreeRTOSConfig.h:96-97,172-178`，`delay.c:47-56`） | configASSERT 走 printf，assert 时可能锁死调度器；USART1 优先级 3 不满足 ≥5 约束 |

## 二、频率算式（可背）

- 遥控 TIM4：`72MHz / ((71+1) × (999+1)) = 1000Hz` → 1ms 中断（`TIM4_Init(1000-1, 72-1)`）
- 车端 TIM2 PWM：`72MHz / ((35+1) × (99+1)) = 20kHz`；占空比 `CCR/(ARR+1)=CCR/100`，CCR 0–100
- 两工程定时器时钟：APB1=36MHz 但预分频≠1，故 TIM2/3/4 时钟=72MHz（`system_stm32f10x.c:1028`）
- 遥控软 I2C：`SCL ≈ 1/(2×10us) = 50kHz`；车端 OLED 软 I2C 与 nRF 软 SPI 速率**未确认**（靠 GPIO/空循环，受编译优化影响）

## 三、最需要追问/测量的 5 点

1. **PC13 驱动 LED 超规格**：两工程都把 PC13 配成 50MHz 推挽（R1）。
2. **车端 PA5 双角色**：既当 nRF MOSI 又当 LED1，`LED_Init` 先于 `NRF24L01_Init`（R2）。
3. **遥控 DHT22 抢 PA1**：DHT22 校验成功即拉高 nRF CE（R3）。
4. **软 I2C 无内部上拉**：MPU6050/OLED 必须有 4.7k–10k 外部上拉，否则 NACK/花屏（R4）。
5. **MCU 型号声明不一致**：两个 uvprojx 都是 STM32F103C8，但遥控用 `startup_stm32f10x_md.s`、车端用 `startup_stm32f10x_hd.s` 且 DebugConfig 是 F103ZE——实物到底 C8 还是 ZE **未确认**。

## 四、代码里没看到、但实物必须有的东西

| 项 | 为什么必须有 | 怎么验证 |
|---|---|---|
| TB6612 的 VM / VCC / STBY | VM 供电机（6–15V）、VCC 供逻辑 3.3V/5V、STBY 高电平才工作；代码只驱动 IN1/IN2/PWM | 万用表测 STBY–VCC=3.3V；VM、VCC 分别上电 |
| 双路降压模块（电池→5V→3.3V） | STM32/nRF/OLED 都要 3.3V，电机不能与逻辑共用一路 | 测 3.3V 纹波；电机堵转时看 3.3V 是否跌落导致复位 |
| MPU6050 的 SDA/SCL 上拉 + VDD 去耦 | 代码开漏且不开内部上拉 | 断电量 SCL/SDA–3.3V≈4.7k–10k；示波器看空闲高电平 |
| OLED 的 SDA/SCL 上拉 + 100nF 去耦 | 同上，且 OLED 上电电流冲击大 | 同上；初始化前空循环不能替代硬件电容 |
| 编码器 A/B 相外部上拉（或推挽输出型编码器）与 RC 滤波 | 内部上拉弱、长线易拾噪 | 示波器看 AB 相 90° 相位与边沿抖动 |
| 电机两端续流二极管/104 电容、TB6612 输出滤波 | 电机换向尖峰会打穿驱动/干扰 MCU | 示波器看 OUT1/OUT2 尖峰；断电测二极管方向 |
| 共地 | 遥控器与车、驱动与 MCU 必须共地 | 万用表蜂鸣档测各模块 GND 连通 |
| nRF24L01 的 3.3V + 10uF/104 去耦 | nRF 发射瞬间电流突增，供电跌落会掉线 | 示波器看 3.3V 在发射瞬间跌落 <100mV |
| 按键外部上拉/RC | 内部上拉仅 30–50kΩ，排线长会误触发 | 示波器看按键释放沿是否抖动 |
| LED 限流电阻 | 代码无任何限流；PC13 尤其只能 3mA | 万用表串测电流，PC13 支路 <3mA |
| 8MHz 晶振 + 2×22pF + 复位 RC + BOOT0/BOOT1 下拉 | 时钟与启动模式决定一切时序 | 频率计测晶振；确认 BOOT0=0 从 Flash 启动 |
| SWD 调试口（SWDIO/SWCLK）引出 | 两工程都没有调试串口日志（遥控端连 USART 都没有） | 确认下载/单步可用，作为唯一观测手段 |
| 电源反接保护/保险丝、电池电压检测 | 代码里没有 ADC 采电池电压，无法低压保护 | 查原理图；若无，飞车/掉电风险需在报告里说明 |
| 舵机/云台（若实物有） | 两工程代码都没有舵机 PWM 输出 | 与需求文档核对，未接则明确说"未做" |

## 五、来源文件（便于面试指认）

- 遥控：`遥控/User/main.c`、`遥控/APP/MyI2C.c`、`遥控/APP/MPU6050.c`、`遥控/APP/nRF24L01_API.c`、`遥控/APP/OLED.c`、`遥控/APP/key/key.c`、`遥控/APP/led/led.c`、`遥控/APP/dht22.c`、`遥控/Public/SysTick.c`、`遥控/Public/time4.c`、`遥控/Libraries/CMSIS/system_stm32f10x.c`
- 车端：`FreeRTOS小车/USER/main.c`、`FreeRTOS小车/HARDWARE/LED/{PWM.c,Motor.c,Encoder.c,led.c,nRF24L01_API.c,OLED.c}`、`FreeRTOS小车/SYSTEM/usart/usart.c`、`FreeRTOS小车/SYSTEM/delay/delay.c`、`FreeRTOS小车/FreeRTOS/include/FreeRTOSConfig.h`
- 已知源码瑕疵（不影响硬件结论，但说明不是最终版）：`遥控/APP/MPU6050.c:92-110` 有重复且语法不完整的函数体；`FreeRTOS小车/USER/main.c:294` 混入了一个 Markdown 代码栅栏。
