---
title: "Improving capability usage on Linux"
date: 2020-12-29T14:18:33-03:00
draft: false
---

Capabilities are a mechanism that allow privileges usually reserved to the
super user to be granted or revoked in a more granular manner. Nowadays, their
usage is reasonably wide spread across the Linux ecosystem, even though some
warts remain in the interface, what with them being applied per thread, not per
process (this is a recurring issue on Linux with credentials: user, group and
supplementary group IDs are all per-thread attributes, instead of being applied
process wide; this requires clever workarounds in libcs, as well as any
language runtime that bypasses libc - see [this Go
commit](https://github.com/golang/go/commit/d1b1145cace8b968307f9311ff611e4bb810710c)
that finally implemented the credential synchronization mechanism in their
runtime).

Back to the matter I wanted to write about, some time ago we got a [bug
report](https://github.com/void-linux/void-packages/issues/26188) in Void Linux
that the yggdrasil system service wasn't working, erroring out and printing
`'libcap-ng is too old for "all" caps'` before exiting. This happened because
we had wanted to apply the same restrictions the [yggdrasil systemd
service](https://github.com/yggdrasil-network/yggdrasil-go/blob/4b16c325a3d90d97df208457bc35d499249f8146/contrib/systemd/yggdrasil.service)
did, which removed nearly all its capabilities and left it only with enough
privileges to manage network interfaces. However, without systemd to do the
heavy lifting for us, this had to be implemented using
[setpriv(1)](https://man.voidlinux.org/setpriv.1) from the
[util-linux](https://github.com/karelzak/util-linux) project, which,
unfortunately, claimed it couldn't act on `all` as parameter to its
capabilities arguments, since it was running on a kernel that had more
capabilities than it "knew" about at build time. Given that it used the
`CAP_LAST_CAP` macro to determine the last capability it knew about and
compared that value with what the kernel told it, the error message was
actually misleading: it didn't really matter what version of
[libcap-ng](https://github.com/stevegrubb/libcap-ng) was being used or what it
had been built with, only what kernel header version had been used when
building util-linux.

How they determined the last available capability in the old version can be
seen here:

```c
// SPDX-License-Identifier: GPL-2.0-or-later
int cap_last_cap(void)
{
	/* CAP_LAST_CAP is untrustworthy. */
	static int ret = -1;
	int matched;
	FILE *f;

	if (ret != -1)
		return ret;

	f = fopen(_PATH_PROC_CAPLASTCAP, "r");
	if (!f) {
		ret = CAP_LAST_CAP;	/* guess */
		return ret;
	}

	matched = fscanf(f, "%d", &ret);
	fclose(f);

	if (matched != 1)
		ret = CAP_LAST_CAP;	/* guess */

	return ret;
}
```

Then, in `setpriv.c`, we can see where it was erroring out:

```c
// SPDX-License-Identifier: GPL-2.0-or-later
static void do_caps(enum cap_type type, const char *caps)
{
	/*
	...
	*/
		if (!strcmp(c + 1, "all")) {
			int i;
			/* It would be really bad if -all didn't drop all
			 * caps.  It's better to just fail. */
			if (cap_last_cap() > CAP_LAST_CAP)
				errx(SETPRIV_EXIT_PRIVERR,
				     _("libcap-ng is too old for \"all\" caps"));
			for (i = 0; i <= CAP_LAST_CAP; i++)
				cap_update(action, type, i);
		}
	/*
	...
	*/
}
```

Basically, this code block existed because the value returned by
`cap_last_cap()` could have been a guess, and therefore couldn't be trusted. It
should be noted that the logic was still somewhat erroneous: on a newer kernel
where `/proc` wasn't mounted, the function would return `CAP_LAST_CAP` and the
program wouldn't error out, even though there were more system capabilities
available than it was aware of.

It felt to me like there should be a better way of doing this, because
otherwise **setpriv(1)** would be too fragile an utility to depend on.
Initially, I [opened an
issue](https://github.com/karelzak/util-linux/issues/1179) in the util-linux
repository where I asked about this apparent fragility, and asked for
suggestions on how to improve the situation; my own initial suggestion had been
simply to improve the documentation to point out the program's limitations, but
that wouldn't solve the issue we were facing in Void Linux, and would still
require changing the yggdrasil service to do something other than run as root
with dropped capabilities.

In thinking about the situation, I ended up taking a deeper look into the
[prctl(2)](https://man.voidlinux.org/prctl.2) system call. Maybe there was
*some* `option` value that would return the highest capability value.
Unfortunately, there wasn't, but what I did find was the `PR_CAPBSET_READ`
option, which didn't change anything about the running process, only queried
some properties; even better, it would return either 0 or 1 for known
capabilities, to show whether they were in the thread's capability bounding
set, or -1, in the case of an invalid (read "unknown to the kernel")
capability. This meant that with some smart binary searching, we could find the
highest capability known to a kernel without an absurd number of system calls.
After some suggestions for improvements, this is what I ended up with:

```c
// SPDX-License-Identifier: GPL-2.0-or-later
static int test_cap(unsigned int cap)
{
	/* prctl returns 0 or 1 for valid caps, -1 otherwise */
	return prctl(PR_CAPBSET_READ, cap, 0, 0, 0) >= 0;
}

int cap_last_cap(void)
{
	static int cap = -1;
	FILE *f;

	if (cap != -1)
		return cap;

	/* try to read value from kernel, check that the path is
	 * indeed in a procfs mount */
	f = fopen(_PATH_PROC_CAPLASTCAP, "r");
	if (f) {
		int matched = 0;

		if (proc_is_procfs(fileno(f))) {
			matched = fscanf(f, "%d", &cap);
		}
		fclose(f);

		/* we check if the cap after this one really isn't valid */
		if (matched == 1 && cap < INT_MAX && !test_cap(cap + 1))
			return cap;
	}

	/* if it wasn't possible to read the file in /proc,
	 * fall back to binary search over capabilities */

	/* starting with cap=INT_MAX means we always know
	 * that cap1 is invalid after the first iteration */
	unsigned int cap0 = 0, cap1 = INT_MAX;
	cap = INT_MAX;
	while ((int)cap0 < cap) {
		if (test_cap(cap)) {
			cap0 = cap;
		} else {
			cap1 = cap;
		}
		cap = (cap0 + cap1) / 2U;
	}

	return cap;
}
```

The advantage of this version of `cap_last_cap()` is that it doesn't even touch
`CAP_LAST_CAP`, and the value returned by it can always be trusted. This
allowed me to simply remove the restriction in **setpriv(1)**. Now, the only
consequence regarding a mismatch between the capabilities supported by the
running kernel and the kernel headers these utilities were built with is that
the capability's name might not be known by libcap-ng, making it necessary to
use a generic `cap_XX` name.

Afterwards, I also added the same algorithm to libcap-ng itself, where I
learned that the maximum value for capabilities supported by the kernel isn't
`INT_MAX`, but instead 64 (at least as of 2020), because capabilities are
tracked in the kernel and file systems as a bitmask stored in two 32-bit
integers. The final version of libcap-ng's `init_lib` can be seen below:

```c
// SPDX-License-Identifier: LGPL-2.1-or-later
static void init_lib(void) __attribute__ ((constructor));
static void init_lib(void)
{
#ifdef HAVE_PTHREAD_H
	pthread_atfork(NULL, NULL, deinit);
#endif
	// Detect last cap
	if (last_cap == 0) {
		int fd;

		// Try to read last cap from procfs
		fd = open("/proc/sys/kernel/cap_last_cap", O_RDONLY);
		if (fd >= 0) {
#ifdef HAVE_LINUX_MAGIC_H
			struct statfs st;
			// Bail out if procfs is invalid or fstatfs fails
			if (fstatfs(fd, &st) || st.f_type != PROC_SUPER_MAGIC)
				goto fail;
#endif
			char buf[8];
			int num = read(fd, buf, sizeof(buf) - 1);
			if (num > 0) {
				buf[num] = 0;
				errno = 0;
				unsigned int val = strtoul(buf, NULL, 10);
				if (errno == 0)
					last_cap = val;
			}
fail:
			close(fd);
		}
		// Run a binary search over capabilities
		if (last_cap == 0) {
			// starting with last_cap=MAX_CAP_VALUE means we always know
			// that cap1 is invalid after the first iteration
			last_cap = MAX_CAP_VALUE;
			unsigned int cap0 = 0, cap1 = MAX_CAP_VALUE;

			while (cap0 < last_cap) {
				if (test_cap(last_cap))
					cap0 = last_cap;
				else
					cap1 = last_cap;

				last_cap = (cap0 + cap1) / 2U;
			}
		}
	}
}
```

Interestingly, when I [strace(1)](https://man.voidlinux.org/strace.1) programs
that use [libcap](https://sites.google.com/site/fullycapable/), it seems they
do a similar sweeping across capabilities using **prctl(2)**. I have yet to
look at their code (stracing things is just so much simpler), but it would seem
my idea wasn't as original as I thought it was. Still, I'm glad to have
improved the utilities whose limitations were affecting us now.
