---
{
  "type": "blog",
  "author": "Érico Nogueira",
  "title": "Hello world - and blinking LEDs! 🚀",
  "description": "Here's my first blog post",
  "image": "images/article-covers/hello.jpg",
  "published": "2020-05-04",
}
---

Welcome to my blog! It was built with `elm-pages` as a learning exercise.
Usually I am more of an embedded systems engineer and systems programmer. I
like using C, a bit of C++ and Python, and I am learning Rust and Go - now Elm
too. I love FOSS software, and am part of the Void Linux organization, more
specifically the documentation team.

---

## Olá mundo - e LEDs piscantes

Bem-vindes ao meu blog! Ele foi construído com `elm-pages`, como um exercício
de aprendizado. Normalmente eu sou um engenheiro de sistemas embarcados e
programador de sistemas. Eu gosto de usar C, um pouco de C++ e Python, e estou
aprendendo Rust e Go - agora Elm também. Eu amo software livre, e sou parte da
organização Void Linux, no time de documentação.

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

and that I want to learn to write code like this:

```elm
plus : number -> number -> number
plus m n =
    m + n
```
