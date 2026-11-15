// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

using System.Security.Cryptography;
using Xunit;

namespace NCode.Fixture.Tests;

// The samples the fixture's documentation pages show. A page includes a marked region by its key, so
// what a page shows is code that compiled and ran.
public sealed class QuickStartSamples
{
    [Fact]
    public void QuickStartSample_Runs()
    {
        Span<byte> password = "correct horse"u8.ToArray();
        Span<byte> salt = stackalloc byte[16];

        Assert.True(Seal(password, salt));
    }

    // begin-snippet: QuickStart
    public static bool Seal(ReadOnlySpan<byte> password, ReadOnlySpan<byte> salt)
    {
        // A pinned 32-byte key, zeroed when the vault is disposed.
        using var vault = Vault.Rent(32, out Span<byte> key);
        Rfc2898DeriveBytes.Pbkdf2(password, salt, key, iterations: 600_000, HashAlgorithmName.SHA256);

        return vault.IsSealed;
    }
    // end-snippet

    [Fact]
    public void DeriveKeySample_Runs()
    {
        // begin-snippet: DeriveKey
        Span<byte> salt = stackalloc byte[16];
        RandomNumberGenerator.Fill(salt);

        using var vault = Vault.Rent(32, out Span<byte> key);
        Rfc2898DeriveBytes.Pbkdf2("correct horse"u8, salt, key, iterations: 600_000, HashAlgorithmName.SHA256);
        // end-snippet

        Assert.Equal(32, key.Length);
    }
}
