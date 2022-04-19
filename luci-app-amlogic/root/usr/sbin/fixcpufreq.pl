#!/usr/bin/perl

use strict;
use File::Basename;

my $uci_config_name;
if(-f "/etc/config/amlogic") {
	$uci_config_name="amlogic";
} elsif(-f "/etc/config/cpufreq") {
	$uci_config_name="cpufreq";
} else {
	print "Can not found amlogic or cpufreq config file!\n";
	exit(0);
}

my @policy_ids;
my @policy_homes = </sys/devices/system/cpu/cpufreq/policy?>;
if(@policy_homes) {
	foreach my $policy_home (@policy_homes) {
		push @policy_ids, substr($policy_home, -1);
	}
} else {
	print "Can not found any policy!\n";
	exit 0;
}

our $need_commit = 0;
for(my $i=0; $i <= $#policy_ids; $i++) {
	&fix_invalid_value($uci_config_name, $policy_ids[$i], $policy_homes[$i]);

}

if($need_commit > 0) {
	&uci_commit($uci_config_name);
}

exit 0;

################################# function ####################################
sub fix_invalid_value {
	my($uci_config, $policy_id, $policy_home) = @_;

	my %gove_hash = &get_gove_hash($policy_home);
	my @freqs = &get_freq_list($policy_home);
	my %freq_hash = &get_freq_hash(@freqs);
	my $min_freq = &get_min_freq(@freqs);
	my $max_freq = &get_max_freq(@freqs);

	my $uci_section = "settings";
	my $uci_option;
	if($uci_config eq "cpufreq" ) {
       	    $uci_option = "governor";
	} else {
       	    $uci_option = "governor" . $policy_id;
	}
	# 如果未设置 governor, 或该 goveernor 不存在， 则修败默认值为 schedutil
	my $config_gove = &uci_get_by_type($uci_config, $uci_section, $uci_option, "NA");
	if( ($config_gove eq "NA") ||
	    ($gove_hash{$config_gove} != 1)) {
		&uci_set_by_type($uci_config, $uci_section, $uci_option, "schedutil");
		$need_commit++;
	}

	# 如果出现不存在的 minfreq, 则修改为实际的 min_freq
	if($uci_config eq "cpufreq" ) {
		# "minifreq" is a spelling error that has always existed in the upstream source code
		$uci_option = "minifreq"; 
	} else {
		$uci_option = "minfreq" . $policy_id;
	}
	my $config_min_freq = &uci_get_by_type($uci_config, $uci_section, $uci_option, "0");
	if($freq_hash{$config_min_freq} != 1) {
		&uci_set_by_type($uci_config, $uci_section, $uci_option, $min_freq);
		$need_commit++;
	}

	# 如果出现不存在的 maxfreq
	# 或 maxfreq < minfreq, 则修改为实际的 max_freq
	if($uci_config eq "cpufreq" ) {
		$uci_option = "maxfreq";
	} else {
		$uci_option = "maxfreq" . $policy_id;
	}
	my $config_max_freq = &uci_get_by_type($uci_config, $uci_section, $uci_option, "0");
	if( ( $freq_hash{$config_max_freq} != 1) || 
            ( $config_max_freq < $config_min_freq)) {
		&uci_set_by_type($uci_config, $uci_section, $uci_option, $max_freq);
		$need_commit++;
	}
}

sub get_freq_list {
	my $policy_home = shift;
        my @ret_ary;
        open my $fh, "<", "${policy_home}/scaling_available_frequencies" or die;
	$_ = <$fh>;
	chomp;
	@ret_ary = split /\s+/;
	close($fh);
	return @ret_ary;
}

sub get_freq_hash {
	my @freq_ary = @_;
	my %ret_hash;
        foreach my $freq (@freq_ary) {
            if($freq =~ m/\d+/) {
                $ret_hash{$freq} = 1;
            }
        }
	return %ret_hash;
}

sub get_min_freq {
	my @freq_ary = @_;
	return (sort {$a<=>$b} @freq_ary)[0];
}

sub get_max_freq {
	my @freq_ary = @_;
	return (sort {$a<=>$b} @freq_ary)[-1];
}

sub get_gove_hash {
	my $policy_home = shift;
	my %ret_hash;
        open my $fh, "<", "${policy_home}/scaling_available_governors" or die;
	$_ = <$fh>;
	chomp;
	my @gov_ary = split /\s+/;
	foreach my $gov (@gov_ary) {
		#print "gov: $gov\n";
		if($gov =~ m/\w+/) {
			$ret_hash{$gov} = 1;
            	}
        }
        close($fh);
	return %ret_hash;
}

sub uci_get_by_type {
	my($config,$section,$option,$default) = @_;
	my $ret;
        $ret=`uci get ${config}.\@${section}\[0\].${option} 2>/dev/null`;
	# 消除回车换行
	$ret =~ s/[\n\r]//g;
	if($ret eq '') {
		return $default;
	} else {
		return $ret;
	}
}

sub uci_set_by_type {
	my($config,$section,$option,$value) = @_;
	my $ret;
	system("uci set ${config}.\@${section}\[0\].${option}=${value}");
	return;
}

sub uci_commit {
	my $config = shift;
	system("uci commit ${config}");
	return;
}
