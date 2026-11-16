// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

using Xunit;

namespace NCode.Fixture.Tests;

// begin-snippet: VaultExtensions
public static class VaultExtensions
{
    extension(Vault vault)
    {
        /// <summary>Whether the vault still holds its secret.</summary>
        public bool HoldsSecret => vault.IsSealed && vault.Length > 0;

        public void CopyTo(Span<byte> destination)
        {
            vault.Span.CopyTo(destination);
        }
    }

    extension(Vault)
    {
        public static Vault RentKey() => Vault.Rent(32, out _);
    }
}
// end-snippet

public sealed class ExtensionSamples
{
    [Fact]
    public void VaultExtensionsSample_Runs()
    {
        using var vault = Vault.RentKey();

        Assert.True(vault.HoldsSecret);
    }
}
