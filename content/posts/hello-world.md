---
title: "Hello World"
date: 2020-06-03T02:16:09-03:00
draft: false
---

Welcome to my blog! It is built with `hugo` for practical purposes. I like using
C with a dash of C++ and Python, and I am learning Rust and Go too. I love FOSS
software, and am part of the Void Linux organization, more specifically the
documentation team.

---

All this to say that I can write code like:

```cpp
#include <stdio.h>

int main()
{
	printf("Hello World!\n");
}
```

or

```python
print('Hello world!')
```

but I can also write code like

```cpp
#include <hal.h>

int main()
{
	while (1) {
		gpio_reg ~= 0x0001;
		delay_ms(200);
	}
}
```
